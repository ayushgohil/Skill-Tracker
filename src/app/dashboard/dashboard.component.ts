// src/app/dashboard/dashboard.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TopicsService } from '../core/services/topics.service';
import { SubjectsService } from '../core/services/subjects.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { SubjectWithTopics } from '../core/models';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [ToastComponent, FormsModule, RouterLink],
    templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {

    // ── State ──────────────────────────────────────────
    subjects = signal<SubjectWithTopics[]>([]);
    loading = signal(true);

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
        private auth: AuthService,
        private toast: ToastService,
        private router: Router
    ) { }

    async ngOnInit() {
        await this.load();
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

    // ── Navigate to subject detail ────────────────────
    openSubject(id: string) {
        this.router.navigate(['/subjects', id]);
    }

    // ── Add Subject ───────────────────────────────────
    async addSubject() {
        if (!this.newSubjectName.trim()) return;
        this.savingSubject.set(true);
        try {
            await this.subjectsService.create(this.newSubjectName.trim(), this.newSubjectColor);
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
        this.subjects.update(subs => subs.map(s =>
            s.id === subId ? { ...s, name: this.editSubjectName.trim(), color: this.editSubjectColor } : s
        ));
        this.editingSubjectId.set(null);
        try {
            await this.subjectsService.update(subId, this.editSubjectName.trim(), this.editSubjectColor);
            this.toast.success('Subject updated.');
        } catch {
            this.toast.error('Failed to update subject.');
            await this.load();
        }
    }

    // ── Delete Subject ────────────────────────────────
    async deleteSubject(event: Event, id: string, name: string) {
        event.stopPropagation();
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