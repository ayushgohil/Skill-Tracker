// src/app/subjects/subject-detail/subject-detail.component.ts
import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SubjectsService } from '../../core/services/subjects.service';
import { TopicsService } from '../../core/services/topics.service';
import { SubtopicsService } from '../../core/services/subtopics.service';
import { ToastService } from '../../core/services/toast.service';
import { PendingDeleteService } from '../../core/services/pending-delete.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
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
import { BottomNavComponent } from '../../shared/bottom-nav/bottom-nav.component';
import { ThemeService } from '../../core/services/theme.service';
import { staggerList, fadeSlideInOut } from '../../core/animations/app.animations';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Title } from '@angular/platform-browser';
import { ShareModalComponent } from '../share-modal/share-modal.component';

import { CacheService } from '../../core/services/cache.service';

export type SortOption = 'default' | 'depth-asc' | 'depth-desc' | 'completed-last' | 'completed-first';

const DEPTH_ORDER: Record<Depth, number> = { shallow: 0, medium: 1, deep: 2 };

@Component({
    selector: 'app-subject-detail',
    standalone: true,
    imports: [TopicItemComponent, ToastComponent, BottomNavComponent, FormsModule, RouterLink, DragDropModule, ShareModalComponent],
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

    // ── Study Partner Modal & Progress ─────────────────
    showShareModal = signal(false);

    partnerCompletedCount = computed(() => {
        return this.topics().reduce((sum, t) => sum + (t.partner_completed ? 1 : 0), 0);
    });

    partnerPercent = computed(() => {
        return this.topics().length ? Math.round((this.partnerCompletedCount() / this.topics().length) * 100) : 0;
    });

    async onPartnerChanged() {
        await this.load(true);
    }

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
        private pendingDelete: PendingDeleteService,
        private network: NetworkStatusService,
        public themeService: ThemeService,
        private titleService: Title,
        private cacheService: CacheService
    ) { }

    async ngOnInit() {
        this.subjectId = this.route.snapshot.paramMap.get('id') ?? '';
        if (!this.subjectId) {
            this.router.navigate(['/dashboard']);
            return;
        }

        // Instantly render cached subject header at 0ms if user navigated from dashboard
        const cachedSubject = this.cacheService.get(`subject_${this.subjectId}`);
        if (cachedSubject) {
            this.subject.set(cachedSubject);
            if (cachedSubject.name) {
                this.titleService.setTitle(`${cachedSubject.name} | Nextlyr Skill Tracker`);
            }
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

    async load(force = false) {
        this.loading.set(true);
        try {
            const [subject, topics] = await Promise.all([
                this.subjectsService.getSubjectById(this.subjectId, force),
                this.subjectsService.getTopicsForSubject(this.subjectId, force)
            ]);
            this.subject.set(subject);
            this.topics.set(this.withoutPendingDeletes(topics));
            if (subject?.name) {
                this.titleService.setTitle(`${subject.name} | Nextlyr Skill Tracker`);
            }
        } catch {
            this.toast.error('Failed to load subject.');
            this.router.navigate(['/dashboard']);
        } finally {
            this.loading.set(false);
        }
    }

    /** Hides topics and subtopics that were deleted a moment ago and can still be undone. */
    private withoutPendingDeletes(topics: TopicWithProgress[]): TopicWithProgress[] {
        return topics
            .filter(t => !this.pendingDelete.isPending(`topic:${t.id}`))
            .map(t => ({
                ...t,
                subtopics: t.subtopics.filter(s => !this.pendingDelete.isPending(`subtopic:${s.id}`))
            }));
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

    /**
     * A save did not go through. Tell the user in plain words (aware of being offline)
     * and offer Retry. Nothing reloads the page, so scroll position, open topics and
     * anything the user typed stay exactly as they were.
     */
    private saveFailed(action: string, retry: () => void) {
        this.toast.error(this.network.describeFailure(action), { label: 'Retry', handler: retry });
    }

    // ── Progress (optimistic, no reload) ──────────────
    onProgressChanged(event: ProgressChange) {
        const previousCompleted = this.topics().find(t => t.id === event.topicId)?.completed ?? false;

        // 1. Optimistic signal update
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, completed: event.completed, notes: event.notes } : t
        ));

        // 2. Fire-and-forget background save
        this.topicsService.upsertProgress(event.topicId, event.completed, event.notes)
            .then(() => event.onResult?.(true))
            .catch(() => {
                event.onResult?.(false);
                // Undo only the tick. Never throw away notes the user has typed.
                this.topics.update(topics => topics.map(t =>
                    t.id === event.topicId ? { ...t, completed: previousCompleted } : t
                ));
                this.saveFailed(
                    event.completed !== previousCompleted ? 'save your progress' : 'save your notes',
                    () => this.onProgressChanged(event)
                );
            });
    }

    // ── Edit Topic ────────────────────────────────────
    onTopicEdited(event: TopicEditEvent) {
        const previous = this.topics().find(t => t.id === event.topicId);
        const previousTitle = previous?.title;
        const previousDepth = previous?.depth;

        // 1. Optimistic signal update
        this.topics.update(topics => topics.map(t =>
            t.id === event.topicId ? { ...t, title: event.title, depth: event.depth } : t
        ));

        // 2. Fire-and-forget background save
        this.topicsService.updateTopic(event.topicId, event.title, event.depth)
            .then(() => this.toast.success('Topic updated.'))
            .catch(() => {
                if (previousTitle !== undefined && previousDepth !== undefined) {
                    this.topics.update(topics => topics.map(t =>
                        t.id === event.topicId ? { ...t, title: previousTitle, depth: previousDepth } : t
                    ));
                }
                this.saveFailed('update the topic', () => this.onTopicEdited(event));
            });
    }

    // ── Delete Topic (hidden at once, real delete after an undo window) ──
    onTopicDeleted(topicId: string) {
        const index = this.topics().findIndex(t => t.id === topicId);
        const removed = this.topics()[index];
        if (!removed) return;

        // 1. Remove from the screen right away
        this.topics.update(topics => topics.filter(t => t.id !== topicId));

        // 2. The real delete only runs once the undo window has passed
        this.pendingDelete.schedule({
            key: `topic:${topicId}`,
            message: `"${removed.title}" deleted.`,
            commit: () => this.topicsService.deleteTopic(topicId),
            undo: () => this.topics.update(topics => {
                if (topics.some(t => t.id === topicId)) return topics;
                const restored = [...topics];
                restored.splice(Math.min(index, restored.length), 0, removed);
                return restored;
            }),
            failMessage: `Couldn't delete "${removed.title}". It has been put back.`
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
            // The form still holds what the user typed, so Retry just submits it again.
            this.saveFailed('add the topic', () => { void this.addTopic(); });
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

        // 3. Fire-and-forget background save. The topic-level progress is only synced
        //    after the tick itself was saved.
        this.subtopicsService.toggleSubtopic(event.subtopicId, event.completed)
            .then(() => {
                if (nowComplete !== wasCompleted) {
                    this.syncTopicProgress(event.topicId, nowComplete);
                }
            }, () => {
                // Undo just this tick (and the topic's automatic state that came from it)
                this.topics.update(topics => topics.map(t => {
                    if (t.id !== event.topicId) return t;
                    return {
                        ...t,
                        subtopics: t.subtopics.map(s =>
                            s.id === event.subtopicId ? { ...s, completed: !event.completed } : s
                        ),
                        completed: wasCompleted
                    };
                }));
                this.saveFailed('update the subtopic', () => this.onSubtopicToggled(event));
            });
    }

    /** Keeps the topic's own progress row in step with its subtopics (retryable). */
    private syncTopicProgress(topicId: string, completed: boolean) {
        this.subtopicsService.updateTopicProgress(topicId, completed)
            .catch(() => this.saveFailed(
                "update the topic's progress",
                () => this.syncTopicProgress(topicId, completed)
            ));
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
            // The input box was already cleared, so Retry sends the same title again.
            this.saveFailed('add the subtopic', () => { void this.onSubtopicAdded(event); });
        }
    }

    // ── Subtopic Deleted (hidden at once, real delete after an undo window) ──
    onSubtopicDeleted(event: SubtopicDeleteEvent) {
        const parent = this.topics().find(t => t.id === event.topicId);
        const index = parent ? parent.subtopics.findIndex(s => s.id === event.subtopicId) : -1;
        const removed = index >= 0 ? parent!.subtopics[index] : undefined;
        if (!removed) return;

        // 1. Remove from the screen right away
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

        // 2. The real delete (and the topic progress sync that follows it) only runs
        //    once the undo window has passed
        this.pendingDelete.schedule({
            key: `subtopic:${event.subtopicId}`,
            message: `Subtopic "${removed.title}" deleted.`,
            commit: async () => {
                await this.subtopicsService.deleteSubtopic(event.subtopicId);

                // Sync topic progress if subtopics remain
                const current = this.topics().find(t => t.id === event.topicId);
                if (current && current.subtopics.length > 0) {
                    const allDone = current.subtopics.every(s => s.completed);
                    this.subtopicsService.updateTopicProgress(event.topicId, allDone)
                        .catch(() => { /* best-effort */ });
                }
            },
            undo: () => this.topics.update(topics => topics.map(t => {
                if (t.id !== event.topicId || t.subtopics.some(s => s.id === removed.id)) return t;
                const restored = [...t.subtopics];
                restored.splice(Math.min(index, restored.length), 0, removed);
                return { ...t, subtopics: restored, completed: restored.every(s => s.completed) };
            })),
            failMessage: `Couldn't delete subtopic "${removed.title}". It has been put back.`
        });
    }

    // ── Reorder Topics ────────────────────────────────
    async onTopicDrop(event: CdkDragDrop<TopicWithProgress[]>) {
        if (event.previousIndex === event.currentIndex) return;
        if (this.sortOption() !== 'default' || this.isSearching()) return;

        const before = this.topics();
        const items = [...before];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.topics.set(items); // Instant 0ms optimistic UI update

        await this.saveTopicOrder(items, before);
    }

    private async saveTopicOrder(items: TopicWithProgress[], before: TopicWithProgress[]) {
        try {
            await this.topicsService.updateTopicsOrder(items);
        } catch (err) {
            console.error('Failed to update topic order:', err);
            // Put the list back the way it was (works offline too, unlike re-fetching it)
            this.topics.set(before);
            this.saveFailed('save the new order', () => {
                this.topics.set(items);
                void this.saveTopicOrder(items, before);
            });
        }
    }

    goBack() {
        this.router.navigate(['/dashboard']);
    }
}

