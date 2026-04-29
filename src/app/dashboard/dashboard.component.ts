import { Component, OnInit, signal, computed, HostListener, ElementRef } from '@angular/core';
import Swal from 'sweetalert2';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TopicsService } from '../core/services/topics.service';
import { SubjectsService } from '../core/services/subjects.service';
import { WeeklyService } from '../core/services/weekly.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { SubjectWithTopics, StarredTopic } from '../core/models';
import { ToastComponent } from '../shared/toast/toast.component';
import { staggerList, fadeSlideInOut } from '../core/animations/app.animations';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [ToastComponent, FormsModule, RouterLink, TitleCasePipe],
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

    // ── State ──────────────────────────────────────────
    subjects = signal<SubjectWithTopics[]>([]);
    loading = signal(true);

    // Weekly review
    reviewDue = signal(false);
    starredTopics = signal<StarredTopic[]>([]);
    loadingWeekly = signal(true);

    // Add subject
    showAddSubject = signal(false);
    newSubjectName = '';
    newSubjectColor = '#10b981';
    savingSubject = signal(false);

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

    constructor(
        private topicsService: TopicsService,
        private subjectsService: SubjectsService,
        private weeklyService: WeeklyService,
        private auth: AuthService,
        private toast: ToastService,
        private router: Router,
        private el: ElementRef
    ) { }

    async ngOnInit() {
        await this.load();
        // Load weekly data in parallel (non-blocking)
        this.loadWeeklyData();
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
            const [isDue, starred] = await Promise.all([
                this.weeklyService.isReviewDue(),
                this.weeklyService.getAllStarredTopics()
            ]);
            this.reviewDue.set(isDue);
            this.starredTopics.set(starred);
        } catch {
            // Non-critical — silently ignore
        } finally {
            this.loadingWeekly.set(false);
        }
    }

    // ── Navigate ──────────────────────────────────────
    openSubject(id: string) {
        this.router.navigate(['/subjects', id]);
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

    logout() { this.auth.logout(); }
}