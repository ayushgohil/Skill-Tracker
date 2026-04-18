// src/app/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TopicsService } from '../core/services/topics.service';
import { CategoriesService } from '../core/services/categories.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { CategoryWithTopics, Depth, TopicWithProgress } from '../core/models';
import { TopicItemComponent, ProgressChange, TopicEditEvent } from './topic-item/topic-item.component';
import { ToastComponent } from '../shared/toast/toast.component';

export type SortOption = 'default' | 'depth-asc' | 'depth-desc' | 'completed-last' | 'completed-first';

const DEPTH_ORDER: Record<Depth, number> = { shallow: 0, medium: 1, deep: 2 };

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [TopicItemComponent, ToastComponent, FormsModule, RouterLink],
    templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
    protected readonly Object = Object;


    // ── State ──────────────────────────────────────────
    categories = signal<CategoryWithTopics[]>([]);
    loading = signal(true);
    expandedTopicId = signal<string | null>(null);

    // Search & sort
    searchQuery = signal('');
    sortOption = signal<SortOption>('default');
    showSortMenu = signal(false);

    // Add category
    showAddCategory = signal(false);
    newCategoryName = '';
    newCategoryColor = '#10b981';
    savingCategory = signal(false);

    // Edit category
    editingCategoryId = signal<string | null>(null);
    editCategoryName = '';
    editCategoryColor = '';

    // Add topic
    addingTopicForCategory = signal<string | null>(null);
    newTopicTitle = '';
    newTopicDepth: Depth = 'medium';
    savingTopic = signal(false);

    // ── Computed ───────────────────────────────────────
    totalTopics = computed(() => this.categories().reduce((s, c) => s + c.totalCount, 0));
    totalCompleted = computed(() => this.categories().reduce((s, c) => s + c.completedCount, 0));
    overallPercent = computed(() =>
        this.totalTopics() ? Math.round((this.totalCompleted() / this.totalTopics()) * 100) : 0
    );
    userEmail = computed(() => this.auth.currentUser()?.email ?? '');

    // Filtered + sorted categories (search + sort applied)
    filteredCategories = computed(() => {
        const q = this.searchQuery().toLowerCase().trim();
        const sort = this.sortOption();

        return this.categories()
            .map(cat => {
                let topics = q
                    ? cat.topics.filter(t => t.title.toLowerCase().includes(q))
                    : [...cat.topics];

                topics = this.sortTopics(topics, sort);

                return { ...cat, topics };
            })
            .filter(cat => !q || cat.topics.length > 0); // hide empty categories when searching
    });

    isSearching = computed(() => this.searchQuery().trim().length > 0);

    sortLabels: Record<SortOption, string> = {
        'default': 'Default',
        'depth-asc': 'Depth: Shallow → Deep',
        'depth-desc': 'Depth: Deep → Shallow',
        'completed-last': 'Incomplete first',
        'completed-first': 'Completed first'
    };

    private clickOutsideHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sort-menu-container')) {
            this.showSortMenu.set(false);
        }
    };

    constructor(
        private topicsService: TopicsService,
        private categoriesService: CategoriesService,
        private auth: AuthService,
        private toast: ToastService
    ) { }

    async ngOnInit() {
        await this.load();
        document.addEventListener('click', this.clickOutsideHandler);
    }

    ngOnDestroy() {
        document.removeEventListener('click', this.clickOutsideHandler);
    }

    async load() {
        this.loading.set(true);
        try {
            this.categories.set(await this.topicsService.getCategoriesWithTopics());
        } catch {
            this.toast.error('Failed to load topics.');
        } finally {
            this.loading.set(false);
        }
    }

    // ── Sort ───────────────────────────────────────────
    sortTopics(topics: TopicWithProgress[], sort: SortOption): TopicWithProgress[] {
        const arr = [...topics];
        switch (sort) {
            case 'depth-asc': return arr.sort((a, b) => DEPTH_ORDER[a.depth] - DEPTH_ORDER[b.depth]);
            case 'depth-desc': return arr.sort((a, b) => DEPTH_ORDER[b.depth] - DEPTH_ORDER[a.depth]);
            case 'completed-last': return arr.sort((a, b) => Number(a.completed) - Number(b.completed));
            case 'completed-first': return arr.sort((a, b) => Number(b.completed) - Number(a.completed));
            default: return arr;
        }
    }

    setSort(option: SortOption) {
        this.sortOption.set(option);
        this.showSortMenu.set(false);
    }

    // ── Space shortcut to toggle focused topic ────────
    @HostListener('document:keydown.space', ['$event'])
    onSpaceKey(event: Event) {
        const kbEvent = event as KeyboardEvent;
        const tag = (kbEvent.target as HTMLElement).tagName;
        // Don't intercept if user is typing in input/textarea
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        const openId = this.expandedTopicId();
        if (!openId) return;

        kbEvent.preventDefault();

        // Find the topic and toggle it
        for (const cat of this.categories()) {
            const topic = cat.topics.find(t => t.id === openId);
            if (topic) {
                this.onProgressChanged({ topicId: openId, completed: !topic.completed, notes: topic.notes });
                this.toast.info(`${topic.completed ? 'Marked incomplete' : 'Marked complete'}`);
                return;
            }
        }
    }

    // ── Accordion ──────────────────────────────────────
    onToggleTopic(topicId: string) {
        this.expandedTopicId.update(id => id === topicId ? null : topicId);
    }

    // ── Progress (optimistic) ─────────────────────────
    async onProgressChanged(event: ProgressChange) {
        this.categories.update(cats => cats.map(cat => {
            const topics = cat.topics.map(t =>
                t.id === event.topicId ? { ...t, completed: event.completed, notes: event.notes } : t
            );
            const completedCount = topics.filter(t => t.completed).length;
            return { ...cat, topics, completedCount, percent: cat.totalCount ? Math.round((completedCount / cat.totalCount) * 100) : 0 };
        }));
        try {
            await this.topicsService.upsertProgress(event.topicId, event.completed, event.notes);
        } catch {
            this.toast.error('Failed to save progress.');
            await this.load();
        }
    }

    // ── Edit Topic ────────────────────────────────────
    async onTopicEdited(event: TopicEditEvent) {
        this.categories.update(cats => cats.map(cat => ({
            ...cat,
            topics: cat.topics.map(t =>
                t.id === event.topicId ? { ...t, title: event.title, depth: event.depth } : t
            )
        })));
        try {
            await this.topicsService.updateTopic(event.topicId, event.title, event.depth);
            this.toast.success('Topic updated.');
        } catch {
            this.toast.error('Failed to update topic.');
            await this.load();
        }
    }

    // ── Delete Topic ──────────────────────────────────
    async onTopicDeleted(topicId: string) {
        this.categories.update(cats => cats.map(cat => {
            const topics = cat.topics.filter(t => t.id !== topicId);
            const completedCount = topics.filter(t => t.completed).length;
            return { ...cat, topics, completedCount, totalCount: topics.length, percent: topics.length ? Math.round((completedCount / topics.length) * 100) : 0 };
        }));
        try {
            await this.topicsService.deleteTopic(topicId);
            this.toast.success('Topic deleted.');
        } catch {
            this.toast.error('Failed to delete topic.');
            await this.load();
        }
    }

    // ── Add Category ──────────────────────────────────
    async addCategory() {
        if (!this.newCategoryName.trim()) return;
        this.savingCategory.set(true);
        try {
            await this.categoriesService.create(this.newCategoryName.trim(), this.newCategoryColor);
            this.newCategoryName = '';
            this.newCategoryColor = '#10b981';
            this.showAddCategory.set(false);
            await this.load();
            this.toast.success('Category created.');
        } catch {
            this.toast.error('Failed to create category.');
        } finally {
            this.savingCategory.set(false);
        }
    }

    // ── Edit Category ─────────────────────────────────
    startEditCategory(event: Event, cat: CategoryWithTopics) {
        event.stopPropagation();
        this.editCategoryName = cat.name;
        this.editCategoryColor = cat.color;
        this.editingCategoryId.set(cat.id);
    }

    cancelEditCategory() { this.editingCategoryId.set(null); }

    async saveEditCategory(catId: string) {
        if (!this.editCategoryName.trim()) return;
        this.categories.update(cats => cats.map(c =>
            c.id === catId ? { ...c, name: this.editCategoryName.trim(), color: this.editCategoryColor } : c
        ));
        this.editingCategoryId.set(null);
        try {
            await this.categoriesService.update(catId, this.editCategoryName.trim(), this.editCategoryColor);
            this.toast.success('Category updated.');
        } catch {
            this.toast.error('Failed to update category.');
            await this.load();
        }
    }

    // ── Delete Category ───────────────────────────────
    async deleteCategory(id: string, name: string) {
        this.categories.update(cats => cats.filter(c => c.id !== id));
        try {
            await this.categoriesService.delete(id);
            this.toast.success(`"${name}" deleted.`);
        } catch {
            this.toast.error('Failed to delete category.');
            await this.load();
        }
    }

    // ── Add Topic ─────────────────────────────────────
    async addTopic(categoryId: string) {
        if (!this.newTopicTitle.trim()) return;
        this.savingTopic.set(true);
        try {
            await this.topicsService.addTopic(categoryId, this.newTopicTitle.trim(), this.newTopicDepth);
            this.newTopicTitle = '';
            this.newTopicDepth = 'medium';
            this.addingTopicForCategory.set(null);
            await this.load();
            this.toast.success('Topic added.');
        } catch {
            this.toast.error('Failed to add topic.');
        } finally {
            this.savingTopic.set(false);
        }
    }

    logout() { this.auth.logout(); }
}