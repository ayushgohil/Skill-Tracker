// src/app/subjects/subject-detail/subject-detail.component.ts
import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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

export type SortOption = 'default' | 'depth-asc' | 'depth-desc' | 'completed-last' | 'completed-first';

const DEPTH_ORDER: Record<Depth, number> = { shallow: 0, medium: 1, deep: 2 };

@Component({
    selector: 'app-subject-detail',
    standalone: true,
    imports: [TopicItemComponent, ToastComponent, FormsModule],
    templateUrl: './subject-detail.component.html'
})
export class SubjectDetailComponent implements OnInit, OnDestroy {
    protected readonly Object = Object;

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

    // ── Computed ───────────────────────────────────────
    totalCount = computed(() => this.topics().length);
    completedCount = computed(() => this.topics().filter(t => t.completed).length);
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
        private toast: ToastService
    ) { }

    async ngOnInit() {
        this.subjectId = this.route.snapshot.paramMap.get('id') ?? '';
        if (!this.subjectId) {
            this.router.navigate(['/dashboard']);
            return;
        }
        await this.load();
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
    }

    // ── Space shortcut to toggle focused topic ────────
    @HostListener('document:keydown.space', ['$event'])
    onSpaceKey(event: Event) {
        const kbEvent = event as KeyboardEvent;
        const tag = (kbEvent.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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

    // ── Progress (optimistic) ─────────────────────────
    async onProgressChanged(event: ProgressChange) {
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, completed: event.completed, notes: event.notes } : t
        ));
        try {
            await this.topicsService.upsertProgress(event.topicId, event.completed, event.notes);
        } catch {
            this.toast.error('Failed to save progress.');
            await this.load();
        }
    }

    // ── Edit Topic ────────────────────────────────────
    async onTopicEdited(event: TopicEditEvent) {
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, title: event.title, depth: event.depth } : t
        ));
        try {
            await this.topicsService.updateTopic(event.topicId, event.title, event.depth);
            this.toast.success('Topic updated.');
        } catch {
            this.toast.error('Failed to update topic.');
            await this.load();
        }
    }

    // ── Delete Topic (optimistic) ─────────────────────
    async onTopicDeleted(topicId: string) {
        this.topics.update(topics => topics.filter(t => t.id !== topicId));
        try {
            await this.topicsService.deleteTopic(topicId);
            this.toast.success('Topic deleted.');
        } catch {
            this.toast.error('Failed to delete topic.');
            await this.load();
        }
    }

    // ── Add Topic ─────────────────────────────────────
    async addTopic() {
        if (!this.newTopicTitle.trim()) return;
        this.savingTopic.set(true);
        try {
            await this.topicsService.addTopic(this.subjectId, this.newTopicTitle.trim(), this.newTopicDepth);
            this.newTopicTitle = '';
            this.newTopicDepth = 'medium';
            this.showAddTopic.set(false);
            await this.load();
            this.toast.success('Topic added.');
        } catch {
            this.toast.error('Failed to add topic.');
        } finally {
            this.savingTopic.set(false);
        }
    }

    // ── Subtopic Toggled ──────────────────────────────
    async onSubtopicToggled(event: SubtopicToggleEvent) {
        // 1. Optimistic update — flip subtopic completed
        this.topics.update(topics => topics.map(t => {
            if (t.id !== event.topicId) return t;

            const updatedSubtopics = t.subtopics.map(st =>
                st.id === event.subtopicId ? { ...st, completed: event.completed } : st
            );

            // Auto-complete: all subtopics done → topic complete; any incomplete → topic incomplete
            const allComplete = updatedSubtopics.length > 0 && updatedSubtopics.every(st => st.completed);
            return { ...t, subtopics: updatedSubtopics, completed: allComplete };
        }));

        try {
            // 2. Persist subtopic toggle
            await this.subtopicsService.toggleSubtopic(event.subtopicId, event.completed);

            // 3. Recompute auto-complete for topic
            const topic = this.topics().find(t => t.id === event.topicId);
            if (topic) {
                const allComplete = topic.subtopics.length > 0 && topic.subtopics.every(st => st.completed);
                await this.subtopicsService.updateTopicProgress(event.topicId, allComplete);
            }
        } catch {
            this.toast.error('Failed to update subtopic.');
            await this.load();
        }
    }

    // ── Subtopic Added ────────────────────────────────
    async onSubtopicAdded(event: SubtopicAddEvent) {
        try {
            const newSub = await this.subtopicsService.addSubtopic(event.topicId, event.title);

            // Optimistic push
            this.topics.update(topics => topics.map(t => {
                if (t.id !== event.topicId) return t;
                const updatedSubtopics = [...t.subtopics, newSub];
                // If we just added a subtopic and it's not completed, topic should be incomplete
                const allComplete = updatedSubtopics.every(st => st.completed);
                return { ...t, subtopics: updatedSubtopics, completed: allComplete };
            }));

            // Update topic progress if needed (new incomplete subtopic → topic not complete)
            const topic = this.topics().find(t => t.id === event.topicId);
            if (topic && !topic.completed) {
                await this.subtopicsService.updateTopicProgress(event.topicId, false);
            }

            this.toast.success('Subtopic added.');
        } catch {
            this.toast.error('Failed to add subtopic.');
            await this.load();
        }
    }

    // ── Subtopic Deleted ──────────────────────────────
    async onSubtopicDeleted(event: SubtopicDeleteEvent) {
        // 1. Optimistic remove
        this.topics.update(topics => topics.map(t => {
            if (t.id !== event.topicId) return t;

            const updatedSubtopics = t.subtopics.filter(st => st.id !== event.subtopicId);

            // If no subtopics left, leave completion as-is (user controls manually)
            if (updatedSubtopics.length === 0) {
                return { ...t, subtopics: updatedSubtopics };
            }

            // If remaining subtopics all complete, auto-complete topic
            const allComplete = updatedSubtopics.every(st => st.completed);
            return { ...t, subtopics: updatedSubtopics, completed: allComplete };
        }));

        try {
            await this.subtopicsService.deleteSubtopic(event.subtopicId);

            // Persist auto-complete state
            const topic = this.topics().find(t => t.id === event.topicId);
            if (topic && topic.subtopics.length > 0) {
                const allComplete = topic.subtopics.every(st => st.completed);
                await this.subtopicsService.updateTopicProgress(event.topicId, allComplete);
            }

            this.toast.success('Subtopic removed.');
        } catch {
            this.toast.error('Failed to delete subtopic.');
            await this.load();
        }
    }

    goBack() {
        this.router.navigate(['/dashboard']);
    }
}
