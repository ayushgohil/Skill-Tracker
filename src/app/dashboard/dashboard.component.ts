import { Component, OnInit, signal, computed, HostListener, ElementRef } from '@angular/core';
import Swal from 'sweetalert2';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TopicsService } from '../core/services/topics.service';
import { SubjectsService } from '../core/services/subjects.service';
import { WeeklyService } from '../core/services/weekly.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { PendingDeleteService } from '../core/services/pending-delete.service';
import { NetworkStatusService } from '../core/services/network-status.service';
import { ActivityService, ActivityLog } from '../core/services/activity.service';
import { SubjectWithTopics, StarredTopic } from '../core/models';
import { ToastComponent } from '../shared/toast/toast.component';
import { BottomNavComponent } from '../shared/bottom-nav/bottom-nav.component';
import { staggerList, fadeSlideInOut } from '../core/animations/app.animations';
import { ProfileService } from '../core/services/profile.service';
import { ThemeService } from '../core/services/theme.service';
import { CollaborationService } from '../core/services/collaboration.service';
import { CacheService } from '../core/services/cache.service';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
    SubjectView, StatusFilter, SortOption, STATUS_FILTERS, SORT_OPTIONS, DEFAULT_VIEW,
    applySubjectView, isViewChanged, matchingTopicTitles, isStatusFilter, isSortOption
} from './subject-view';

const VIEW_STORAGE_KEY = 'skilltracker.dashboard.view.v1';
/** The search and filter tools only appear once there are enough subjects to need them. */
const SHOW_TOOLS_FROM = 4;

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [ToastComponent, BottomNavComponent, FormsModule, RouterLink, DragDropModule],
    templateUrl: './dashboard.component.html',
    animations: [staggerList, fadeSlideInOut]
})
export class DashboardComponent implements OnInit {

    // ── Spotlight Tracking ────────────────────────────
    @HostListener('mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.el) return;
        const cards = this.el.nativeElement.querySelectorAll('.spotlight-card');
        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        }
    }

    // ── Header Collapse on Scroll ─────────────────────
    headerCollapsed = signal(false);

    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (typeof window !== 'undefined') {
            this.headerCollapsed.set(window.scrollY > 140);
        }
    }

    // ── State ──────────────────────────────────────────
    subjects = signal<SubjectWithTopics[]>([]);
    loading = signal(true);

    // Weekly review
    reviewDue = signal(false);
    starredTopics = signal<StarredTopic[]>([]);
    loadingWeekly = signal(true);
    currentStreak = signal(0);

    // Add subject
    showAddSubject = signal(false);
    /** Phone only: the subject whose Edit / Delete menu is open. */
    actionSheetSub = signal<SubjectWithTopics | null>(null);
    newSubjectName = '';
    newSubjectColor = '#2563EB';
    savingSubject = signal(false);

    selectedIcon = signal('code');
    icons = ['code', 'palette', 'terminal', 'fitness', 'language', 'architecture', 'science', 'music'];
    colors = ['#2563EB', '#0F766E', '#B91C1C', '#10B981', '#7C3AED', '#F59E0B'];

    // Edit subject
    editingSubjectId = signal<string | null>(null);
    editSubjectName = '';
    editSubjectColor = '';

    // ── Search, filter and sort ────────────────────────
    searchQuery = signal('');
    statusFilter = signal<StatusFilter>('all');
    sortBy = signal<SortOption>('custom');
    readonly statusFilters = STATUS_FILTERS;
    readonly sortOptions = SORT_OPTIONS;

    private view = computed<SubjectView>(() => ({
        query: this.searchQuery(),
        status: this.statusFilter(),
        sort: this.sortBy()
    }));

    visibleSubjects = computed(() => applySubjectView(this.subjects(), this.view()));
    viewChanged = computed(() => isViewChanged(this.view()));
    /** Dragging only makes sense when you see your own full list. */
    canReorder = computed(() => !this.viewChanged());
    showListTools = computed(() => this.subjects().length >= SHOW_TOOLS_FROM || this.viewChanged());
    hasSharedSubjects = computed(() => this.subjects().some(s => s.is_shared));

    // ── Computed ───────────────────────────────────────
    totalTopics = computed(() => this.subjects().reduce((s, c) => s + c.totalCount, 0));
    totalCompleted = computed(() => this.subjects().reduce((s, c) => s + c.completedCount, 0));
    overallPercent = computed(() =>
        this.totalTopics() ? Math.round((this.totalCompleted() / this.totalTopics()) * 100) : 0
    );
    userEmail = computed(() => this.auth.currentUser()?.email ?? '');
    userAvatar = computed(() => this.auth.currentUser()?.user_metadata?.['avatar_url'] ?? '');
    userInitial = computed(() => {
        const name = this.profileService.userProfile()?.display_name;
        if (name && name.trim()) return name.trim()[0].toUpperCase();
        return this.userEmail()?.[0]?.toUpperCase() ?? '';
    });

    constructor(
        private topicsService: TopicsService,
        private subjectsService: SubjectsService,
        private weeklyService: WeeklyService,
        private activityService: ActivityService,
        private auth: AuthService,
        private toast: ToastService,
        private router: Router,
        private el: ElementRef,
        private profileService: ProfileService,
        public themeService: ThemeService,
        private collabService: CollaborationService,
        private cacheService: CacheService,
        private pendingDelete: PendingDeleteService,
        private network: NetworkStatusService
    ) { }

    ngOnInit() {
        this.restoreView();
        // Fire all dashboard data loaders concurrently so UI hydrates immediately in parallel
        this.load();
        this.loadWeeklyData();
        this.loadProfile();
    }

    /** Brings back the sort and filter chosen last time (the search text is never kept). */
    private restoreView() {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null;
            const saved = raw ? JSON.parse(raw) : null;
            if (saved && isStatusFilter(saved.status)) this.statusFilter.set(saved.status);
            if (saved && isSortOption(saved.sort)) this.sortBy.set(saved.sort);
        } catch {
            // Storage blocked or damaged: start with the default view.
        }
    }

    private rememberView() {
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ status: this.statusFilter(), sort: this.sortBy() }));
        } catch {
            // Not important: the lists still work.
        }
    }

    setStatusFilter(value: StatusFilter) {
        this.statusFilter.set(value);
        this.rememberView();
    }

    setSort(value: string) {
        this.sortBy.set(isSortOption(value) ? value : DEFAULT_VIEW.sort);
        this.rememberView();
    }

    clearView() {
        this.searchQuery.set('');
        this.statusFilter.set(DEFAULT_VIEW.status);
        this.sortBy.set(DEFAULT_VIEW.sort);
        this.rememberView();
    }

    /** Topic titles (up to two) that matched the search, shown under the subject name. */
    topicMatches(subject: SubjectWithTopics): string[] {
        return matchingTopicTitles(subject, this.searchQuery()).slice(0, 2);
    }

    private async loadProfile() {
        try {
            await this.profileService.getProfile();
        } catch (err) {
            console.error('Profile error on dashboard init:', err);
        }
    }

    async load() {
        const cached = this.cacheService.get('subjects_with_topics');
        if (cached) {
            this.subjects.set(this.withoutPendingDeletes(cached));
            this.loading.set(false);
            return;
        }

        this.loading.set(true);
        try {
            this.subjects.set(this.withoutPendingDeletes(await this.topicsService.getSubjectsWithTopics()));
        } catch {
            this.toast.error('Failed to load subjects.');
        } finally {
            this.loading.set(false);
        }
    }

    /** Hides subjects that were deleted (or left) a moment ago and can still be undone. */
    private withoutPendingDeletes(subjects: SubjectWithTopics[]): SubjectWithTopics[] {
        return subjects.filter(s => !this.pendingDelete.isPending(`subject:${s.id}`));
    }

    private putSubjectBack(subject: SubjectWithTopics, index: number) {
        this.subjects.update(subs => {
            if (subs.some(s => s.id === subject.id)) return subs;
            const restored = [...subs];
            restored.splice(Math.min(index, restored.length), 0, subject);
            return restored;
        });
    }

    private async loadWeeklyData() {
        const cachedDue = this.cacheService.get('weekly_review_due');
        const cachedStarred = this.cacheService.get('weekly_starred_topics');
        const cachedLogs = this.cacheService.get('recent_activity_logs');

        if (cachedDue !== undefined && cachedDue !== null && cachedStarred && cachedLogs) {
            this.reviewDue.set(cachedDue);
            this.starredTopics.set(cachedStarred);
            this.calculateStreak(cachedLogs);
            this.loadingWeekly.set(false);
            return;
        }

        try {
            const [isDue, starred, logs] = await Promise.all([
                this.weeklyService.isReviewDue(),
                this.weeklyService.getAllStarredTopics(),
                // Use getRecentActivityLogs() instead of getActivityLogsForYear() so that
                // cross-year streaks (e.g. Dec 31 → Jan 1) are calculated correctly (Bug #3 fix)
                this.activityService.getRecentActivityLogs()
            ]);
            this.reviewDue.set(isDue);
            this.starredTopics.set(starred);
            this.calculateStreak(logs);
        } catch {
            // Non-critical — silently ignore
        } finally {
            this.loadingWeekly.set(false);
        }
    }

    private calculateStreak(logs: ActivityLog[]) {
        if (!logs || logs.length === 0) {
            this.currentStreak.set(0);
            return;
        }

        const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Bug #1 fix: Use LOCAL date strings, not UTC (toISOString() returns UTC which
        // can be the wrong calendar day for users in timezones ahead of UTC like IST).
        const today = this.activityService.getLocalDateStr();
        const yesterdayObj = new Date();
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterday = this.activityService.getLocalDateStr(yesterdayObj);

        // Bug #2 fix: Use .split('T')[0] defensively in case DB returns a full ISO timestamp
        const mostRecentDate = sortedLogs[0].date.split('T')[0];
        const streakActive = mostRecentDate === today || mostRecentDate === yesterday;

        if (!streakActive) {
            this.currentStreak.set(0);
            return;
        }

        let tempStreak = 0;
        let lastDate: Date | null = null;

        const ascLogs = [...sortedLogs].reverse();

        for (const log of ascLogs) {
            // Parse the date-only string as local midnight to avoid UTC offset issues
            const [y, mo, d] = log.date.split('T')[0].split('-').map(Number);
            const logDate = new Date(y, mo - 1, d);

            if (!lastDate) {
                tempStreak = 1;
            } else {
                const diffTime = Math.abs(logDate.getTime() - lastDate.getTime());
                // Bug #4 fix: Use Math.round instead of Math.ceil to avoid off-by-one
                // errors from DST transitions or floating-point precision.
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    tempStreak = 1;
                }
            }
            lastDate = logDate;
        }

        this.currentStreak.set(tempStreak);
    }

    // ── Navigate ──────────────────────────────────────
    openSubject(id: string, searchTopic?: string) {
        if (searchTopic) {
            this.router.navigate(['/subjects', id], { queryParams: { search: searchTopic } });
        } else {
            this.router.navigate(['/subjects', id]);
        }
    }

    goToWeeklyReview() {
        this.router.navigate(['/weekly']);
    }

    // ── Title Case helper ─────────────────────────────
    toTitleCase(value: string): string {
        return value.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1));
    }

    // ── Add Subject ───────────────────────────────────
    async addSubject() {
        if (!this.newSubjectName.trim()) return;
        this.savingSubject.set(true);
        try {
            await this.subjectsService.create(this.toTitleCase(this.newSubjectName.trim()), this.newSubjectColor);
            this.newSubjectName = '';
            this.newSubjectColor = '#10b981';
            this.showAddSubject.set(false);
            await this.load();
            this.toast.success('Subject created.');
        } catch {
            this.toast.error('Failed to create subject.');
        } finally {
            this.savingSubject.set(false);
        }
    }

    // ── Edit Subject ──────────────────────────────────
    openActionSheet(event: Event, sub: SubjectWithTopics) {
        event.stopPropagation();
        this.actionSheetSub.set(sub);
    }

    closeActionSheet() {
        this.actionSheetSub.set(null);
    }

    startEditSubject(event: Event, sub: SubjectWithTopics) {
        event.stopPropagation();
        this.editSubjectName = sub.name;
        this.editSubjectColor = sub.color;
        this.editingSubjectId.set(sub.id);
    }

    cancelEditSubject(event?: Event) {
        event?.stopPropagation();
        this.editingSubjectId.set(null);
    }

    async saveEditSubject(event: Event, subId: string) {
        event.stopPropagation();
        if (!this.editSubjectName.trim()) return;
        const titledName = this.toTitleCase(this.editSubjectName.trim());
        const color = this.editSubjectColor;
        const previous = this.subjects().find(s => s.id === subId);
        this.subjects.update(subs => subs.map(s =>
            s.id === subId ? { ...s, name: titledName, color } : s
        ));
        this.editingSubjectId.set(null);
        await this.saveSubjectEdit(subId, titledName, color, previous?.name, previous?.color);
    }

    private async saveSubjectEdit(subId: string, name: string, color: string, previousName?: string, previousColor?: string) {
        try {
            await this.subjectsService.update(subId, name, color);
            this.toast.success('Subject updated.');
        } catch {
            // Put back the old name and colour instead of reloading the whole dashboard
            if (previousName !== undefined && previousColor !== undefined) {
                this.subjects.update(subs => subs.map(s =>
                    s.id === subId ? { ...s, name: previousName, color: previousColor } : s
                ));
            }
            this.toast.error(this.network.describeFailure('update the subject'), {
                label: 'Retry',
                handler: () => {
                    this.subjects.update(subs => subs.map(s =>
                        s.id === subId ? { ...s, name, color } : s
                    ));
                    void this.saveSubjectEdit(subId, name, color, previousName, previousColor);
                }
            });
        }
    }

    // ── Delete Subject / Leave Shared Subject ─────────
    async deleteSubject(event: Event, sub: SubjectWithTopics) {
        event.stopPropagation();
        if (sub.is_shared && !sub.is_owner) {
            const result = await Swal.fire({
                title: 'Leave Shared Subject?',
                text: `"${sub.name}" will be removed from your dashboard.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes, leave subject',
                cancelButtonText: 'Cancel',
                background: '#18181b',
                color: '#f4f4f5',
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#3f3f46'
            });
            if (!result.isConfirmed) return;

            const index = this.subjects().findIndex(s => s.id === sub.id);
            this.subjects.update(subs => subs.filter(s => s.id !== sub.id));
            this.pendingDelete.schedule({
                key: `subject:${sub.id}`,
                message: `Left "${sub.name}".`,
                commit: () => this.collabService.leaveSubject(sub.id),
                undo: () => this.putSubjectBack(sub, index),
                failMessage: `Couldn't leave "${sub.name}". It has been put back.`
            });
            return;
        }

        const result = await Swal.fire({
            title: 'Delete Subject?',
            text: sub.is_shared
                ? `"${sub.name}" and all its topics will be permanently removed. Your study partner will also lose access.`
                : `"${sub.name}" and all its topics will be permanently removed.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it',
            cancelButtonText: 'Cancel',
            background: '#18181b',
            color: '#f4f4f5',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#3f3f46'
        });
        if (!result.isConfirmed) return;

        const index = this.subjects().findIndex(s => s.id === sub.id);
        this.subjects.update(subs => subs.filter(s => s.id !== sub.id));
        this.pendingDelete.schedule({
            key: `subject:${sub.id}`,
            message: `"${sub.name}" deleted.`,
            commit: () => this.subjectsService.delete(sub.id),
            undo: () => this.putSubjectBack(sub, index),
            failMessage: `Couldn't delete "${sub.name}". It has been put back.`
        });
    }

    // ── Reorder Subjects ──────────────────────────────
    async onSubjectDrop(event: CdkDragDrop<SubjectWithTopics[]>) {
        if (event.previousIndex === event.currentIndex) return;

        const before = this.subjects();
        const items = [...before];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.subjects.set(items); // Instant 0ms optimistic UI update

        await this.saveSubjectOrder(items, before);
    }

    private async saveSubjectOrder(items: SubjectWithTopics[], before: SubjectWithTopics[]) {
        try {
            await this.subjectsService.updateSubjectsOrder(items);
        } catch (err) {
            console.error('Failed to update subject order:', err);
            // Put the list back the way it was (works offline too, unlike re-fetching it)
            this.subjects.set(before);
            this.toast.error(this.network.describeFailure('save the new order'), {
                label: 'Retry',
                handler: () => {
                    this.subjects.set(items);
                    void this.saveSubjectOrder(items, before);
                }
            });
        }
    }

    logout() { this.auth.logout(); }
}
