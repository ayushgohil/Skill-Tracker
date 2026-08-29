import { Component, OnInit, signal, computed, HostListener, ElementRef } from '@angular/core';
import Swal from 'sweetalert2';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TopicsService } from '../core/services/topics.service';
import { SubjectsService } from '../core/services/subjects.service';
import { WeeklyService } from '../core/services/weekly.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { ActivityService, ActivityLog } from '../core/services/activity.service';
import { SubjectWithTopics, StarredTopic } from '../core/models';
import { ToastComponent } from '../shared/toast/toast.component';
import { staggerList, fadeSlideInOut } from '../core/animations/app.animations';
import { ProfileService } from '../core/services/profile.service';
import { ThemeService } from '../core/services/theme.service';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [ToastComponent, FormsModule, RouterLink, DragDropModule],
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
        public themeService: ThemeService
    ) { }

    async ngOnInit() {
        await this.load();
        this.loadWeeklyData();

        // Hydrate profile signal
        try {
            await this.profileService.getProfile();
        } catch (err) {
            console.error('Profile error on dashboard init:', err);
        }
    }

    async load() {
        this.loading.set(true);
        try {
            this.subjects.set(await this.topicsService.getSubjectsWithTopics());
        } catch {
            this.toast.error('Failed to load subjects.');
        } finally {
            this.loading.set(false);
        }
    }

    private async loadWeeklyData() {
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
        this.subjects.update(subs => subs.map(s =>
            s.id === subId ? { ...s, name: titledName, color: this.editSubjectColor } : s
        ));
        this.editingSubjectId.set(null);
        try {
            await this.subjectsService.update(subId, titledName, this.editSubjectColor);
            this.toast.success('Subject updated.');
        } catch {
            this.toast.error('Failed to update subject.');
            await this.load();
        }
    }

    // ── Delete Subject ────────────────────────────────
    async deleteSubject(event: Event, id: string, name: string) {
        event.stopPropagation();
        const result = await Swal.fire({
            title: 'Delete Subject?',
            text: `"${name}" and all its topics will be permanently removed.`,
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
        this.subjects.update(subs => subs.filter(s => s.id !== id));
        try {
            await this.subjectsService.delete(id);
            this.toast.success(`"${name}" deleted.`);
        } catch {
            this.toast.error('Failed to delete subject.');
            await this.load();
        }
    }

    // ── Reorder Subjects ──────────────────────────────
    async onSubjectDrop(event: CdkDragDrop<SubjectWithTopics[]>) {
        if (event.previousIndex === event.currentIndex) return;

        const items = [...this.subjects()];
        moveItemInArray(items, event.previousIndex, event.currentIndex);
        this.subjects.set(items); // Instant 0ms optimistic UI update

        try {
            await this.subjectsService.updateSubjectsOrder(items);
        } catch (err) {
            console.error('Failed to update subject order:', err);
            this.toast.error('Failed to save subject order.');
            this.subjects.set(await this.topicsService.getSubjectsWithTopics());
        }
    }

    logout() { this.auth.logout(); }
}