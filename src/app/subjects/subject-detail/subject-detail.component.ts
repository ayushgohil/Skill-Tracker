// src/app/subjects/subject-detail/subject-detail.component.ts
import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SubjectsService } from '../../core/services/subjects.service';
import { TopicsService } from '../../core/services/topics.service';
import { SubtopicsService } from '../../core/services/subtopics.service';
import { ToastService } from '../../core/services/toast.service';
import { Subject, TopicWithProgress, Depth } from '../../core/models';
import {
    TopicItemComponent,
    ProgressChange,
    TopicEditEvent,
    SubtopicToggleEvent,
    SubtopicAddEvent,
    SubtopicDeleteEvent
} from '../../dashboard/topic-item/topic-item.component';
import { ToastComponent } from '../../shared/toast/toast.component';
import { ThemeService } from '../../core/services/theme.service';
import { staggerList, fadeSlideInOut } from '../../core/animations/app.animations';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

export type SortOption = 'default' | 'depth-asc' | 'depth-desc' | 'completed-last' | 'completed-first';

const DEPTH_ORDER: Record<Depth, number> = { shallow: 0, medium: 1, deep: 2 };

@Component({
    selector: 'app-subject-detail',
    standalone: true,
    imports: [TopicItemComponent, ToastComponent, FormsModule, RouterLink, DragDropModule],
    templateUrl: './subject-detail.component.html',
    animations: [staggerList, fadeSlideInOut]
})
export class SubjectDetailComponent implements OnInit, OnDestroy {

    protected readonly Object = Object;

    // ── Header Collapse on Scroll ─────────────────────
    headerCollapsed = signal(false);

    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (typeof window !== 'undefined') {
            this.headerCollapsed.set(window.scrollY > 100);
        }
    }

    // ── State ──────────────────────────────────────────
    subject = signal<Subject | null>(null);
    topics = signal<TopicWithProgress[]>([]);
    loading = signal(true);
    expandedTopicId = signal<string | null>(null);

    // Search & sort
    searchQuery = signal('');
    sortOption = signal<SortOption>('default');
    showSortMenu = signal(false);

    // Add topic
    showAddTopic = signal(false);
    newTopicTitle = '';
    newTopicDepth: Depth = 'medium';
    savingTopic = signal(false);

    // ── Computed (subtopic-aware progress) ─────────────
    totalCount = computed(() => {
        return this.topics().reduce((sum, t) => {
            return sum + (t.subtopics.length > 0 ? t.subtopics.length : 1);
        }, 0);
    });

    completedCount = computed(() => {
        return this.topics().reduce((sum, t) => {
            if (t.subtopics.length > 0) {
                return sum + t.subtopics.filter(s => s.completed).length;
            }
            return sum + (t.completed ? 1 : 0);
        }, 0);
    });

    percent = computed(() =>
        this.totalCount() ? Math.round((this.completedCount() / this.totalCount()) * 100) : 0
    );

    filteredTopics = computed(() => {
        const q = this.searchQuery().toLowerCase().trim();
        const sort = this.sortOption();

        let result = q
            ? this.topics().filter(t => t.title.toLowerCase().includes(q))
            : [...this.topics()];

        return this.sortTopics(result, sort);
    });

    isSearching = computed(() => this.searchQuery().trim().length > 0);

    sortLabels: Record<SortOption, string> = {
        'default': 'Default',
        'depth-asc': 'Depth: Shallow → Deep',
        'depth-desc': 'Depth: Deep → Shallow',
        'completed-last': 'Incomplete first',
        'completed-first': 'Completed first'
    };

    private subjectId = '';
    private clickOutsideHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sort-menu-container')) {
            this.showSortMenu.set(false);
        }
    };

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private subjectsService: SubjectsService,
        private topicsService: TopicsService,
        private subtopicsService: SubtopicsService,
        private toast: ToastService,
        public themeService: ThemeService
    ) { }

    async ngOnInit() {
        this.subjectId = this.route.snapshot.paramMap.get('id') ?? '';
        if (!this.subjectId) {
            this.router.navigate(['/dashboard']);
            return;
        }

        const searchParam = this.route.snapshot.queryParamMap.get('search');
        if (searchParam) {
            this.searchQuery.set(searchParam);
        }

        await this.load();

        if (searchParam) {
            const matchingTopic = this.topics().find(t => t.title.toLowerCase() === searchParam.toLowerCase());
            if (matchingTopic) {
                this.expandedTopicId.set(matchingTopic.id);
            }
        }

        document.addEventListener('click', this.clickOutsideHandler);
    }

    ngOnDestroy() {
        document.removeEventListener('click', this.clickOutsideHandler);
    }

    async load() {
        this.loading.set(true);
        try {
            const [subject, topics] = await Promise.all([
                this.subjectsService.getSubjectById(this.subjectId),
                this.subjectsService.getTopicsForSubject(this.subjectId)
            ]);
            this.subject.set(subject);
            this.topics.set(topics);
        } catch {
            this.toast.error('Failed to load subject.');
            this.router.navigate(['/dashboard']);
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
        this.expandedTopicId.set(null);
    }

    // ── Space shortcut to toggle focused topic ────────
    @HostListener('document:keydown.space', ['$event'])
    onSpaceKey(event: Event) {
        const kbEvent = event as KeyboardEvent;
        const target = kbEvent.target as HTMLElement;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;

        const openId = this.expandedTopicId();
        if (!openId) return;

        kbEvent.preventDefault();

        const topic = this.topics().find(t => t.id === openId);
        if (topic) {
            // Only allow space-toggle if no subtopics
            if (topic.subtopics.length > 0) return;
            this.onProgressChanged({ topicId: openId, completed: !topic.completed, notes: topic.notes });
            this.toast.info(`${topic.completed ? 'Marked incomplete' : 'Marked complete'}`);
        }
    }

    // ── Accordion ──────────────────────────────────────
    onToggleTopic(topicId: string) {
        this.expandedTopicId.update(id => id === topicId ? null : topicId);
    }

    // ── Progress (optimistic, no reload) ──────────────
    onProgressChanged(event: ProgressChange) {
        // 1. Optimistic signal update
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, completed: event.completed, notes: event.notes } : t
        ));

        // 2. Fire-and-forget background save
        this.topicsService.upsertProgress(event.topicId, event.completed, event.notes)
            .catch(() => {
                this.toast.error('Failed to save progress.');
                this.load();
            });
    }

    // ── Edit Topic ────────────────────────────────────
    onTopicEdited(event: TopicEditEvent) {
        // 1. Optimistic signal update
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, title: event.title, depth: event.depth } : t
        ));

        // 2. Fire-and-forget background save
        this.topicsService.updateTopic(event.topicId, event.title, event.depth)
            .then(() => this.toast.success('Topic updated.'))
            .catch(() => {
                this.toast.error('Failed to update topic.');
                this.load();
            });
    }

    // ── Delete Topic (optimistic, no reload) ──────────
    onTopicDeleted(topicId: string) {
        // 1. Optimistic signal remove
        this.topics.update(topics => topics.filter(t => t.id !== topicId));

        // 2. Fire-and-forget background delete
        this.topicsService.deleteTopic(topicId)
            .then(() => this.toast.success('Topic deleted.'))
            .catch(() => {
                this.toast.error('Failed to delete topic.');
                this.load();
            });
    }

    // ── Title Case helper ──────────────────────────────
    toTitleCase(value: string): string {
        return value.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1));
    }

    // ── Add Topic (optimistic, no reload) ─────────────
    async addTopic() {
        if (!this.newTopicTitle.trim()) return;
        this.savingTopic.set(true);
        try {
            const returnedTopic = await this.topicsService.addTopic(
                this.subjectId, this.newTopicTitle.trim(), this.newTopicDepth
            );

            // Build a TopicWithProgress from the returned Topic
            const newTopic: TopicWithProgress = {
                ...returnedTopic,
                completed: false,
                notes: '',
                subtopics: []
            };

            // Optimistic push into signal
            this.topics.update(t => [...t, newTopic]);

            // Reset form
            this.newTopicTitle = '';
            this.newTopicDepth = 'medium';
            this.showAddTopic.set(false);
            this.toast.success('Topic added.');
        } catch {
            this.toast.error('Failed to add topic.');
            this.load();
        } finally {
            this.savingTopic.set(false);
        }
    }

    // ── Subtopic Toggled (optimistic, no reload) ──────
    onSubtopicToggled(event: SubtopicToggleEvent) {
        // Capture previous topic state for rollback context
        const prevTopic = this.topics().find(t => t.id === event.topicId);
        const wasCompleted = prevTopic?.completed ?? false;

        // 1. Optimistic signal update — flip subtopic and recompute topic.completed
        this.topics.update(topics =>
            topics.map(t => {
                if (t.id !== event.topicId) return t;
                const updatedSubtopics = t.subtopics.map(s =>
                    s.id === event.subtopicId ? { ...s, completed: event.completed } : s
                );
                const allDone = updatedSubtopics.length > 0 &&
                    updatedSubtopics.every(s => s.completed);
                return { ...t, subtopics: updatedSubtopics, completed: allDone };
            })
        );

        // 2. Read the updated topic state from signal
        const updatedTopic = this.topics().find(t => t.id === event.topicId);
        const nowComplete = updatedTopic?.completed ?? false;

        // 3. Fire-and-forget background saves
        this.subtopicsService.toggleSubtopic(event.subtopicId, event.completed)
            .catch(() => {
                this.toast.error('Failed to update subtopic.');
                this.load();
            });

        // 4. Sync topic-level progress if auto-complete state changed
        if (nowComplete !== wasCompleted) {
            this.subtopicsService.updateTopicProgress(event.topicId, nowComplete)
                .catch(() => {
                    this.toast.error('Failed to sync topic progress.');
                    this.load();
                });
        }
    }

    // ── Subtopic Added (optimistic, no reload) ────────
    async onSubtopicAdded(event: SubtopicAddEvent) {
        try {
            const newSub = await this.subtopicsService.addSubtopic(event.topicId, event.title);

            // Optimistic push into the correct topic's subtopics
            this.topics.update(topics =>
                topics.map(t => {
                    if (t.id !== event.topicId) return t;
                    const updatedSubtopics = [...t.subtopics, newSub];
                    // New subtopic is incomplete → topic can't be complete
                    const allDone = updatedSubtopics.every(s => s.completed);
                    return { ...t, subtopics: updatedSubtopics, completed: allDone };
                })
            );

            // Sync topic progress (new incomplete subtopic → topic not complete)
            this.subtopicsService.updateTopicProgress(event.topicId, false)
                .catch(() => { /* best-effort */ });

            this.toast.success('Subtopic added.');
        } catch {
            this.toast.error('Failed to add subtopic.');
            this.load();
        }
    }

    // ── Subtopic Deleted (optimistic, no reload) ──────
    onSubtopicDeleted(event: SubtopicDeleteEvent) {
        // 1. Optimistic remove from signal
        this.topics.update(topics =>
            topics.map(t => {
                if (t.id !== event.topicId) return t;
                const remaining = t.subtopics.filter(s => s.id !== event.subtopicId);
                // No subtopics left → leave topic.completed as-is (manual control)
                if (remaining.length === 0) {
                    return { ...t, subtopics: remaining };
                }
                // Remaining all complete → auto-complete topic
                const allDone = remaining.every(s => s.completed);
                return { ...t, subtopics: remaining, completed: allDone };
            })
        );

        // 2. Read updated state
        const updatedTopic = this.topics().find(t => t.id === event.topicId);

        // 3. Fire-and-forget background delete
        this.subtopicsService.deleteSubtopic(event.subtopicId)
            .then(() => this.toast.success('Subtopic removed.'))
            .catch(() => {
                this.toast.error('Failed to delete subtopic.');
                this.load();
            });

        // 4. Sync topic progress if subtopics remain
        if (updatedTopic && updatedTopic.subtopics.length > 0) {
            const allDone = updatedTopic.subtopics.every(s => s.completed);
            this.subtopicsService.updateTopicProgress(event.topicId, allDone)
                .catch(() => { /* best-effort */ });
        }
    }

    // ── Reorder Topics ────────────────────────────────
    async onTopicDrop(event: CdkDragDrop<TopicWithProgress[]>) {
        if (event.previousIndex === event.currentIndex) return;
        if (this.sortOption() !== 'default' || this.isSearching()) return;

        const items = [...this.topics()];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.topics.set(items); // Instant 0ms optimistic UI update

        try {
            await this.topicsService.updateTopicsOrder(items);
        } catch (err) {
            console.error('Failed to update topic order:', err);
            this.toast.error('Failed to save topic order.');
            if (this.subject()) {
                this.topics.set(await this.subjectsService.getTopicsForSubject(this.subject()!.id));
            }
        }
    }

    goBack() {
        this.router.navigate(['/dashboard']);
    }
}

