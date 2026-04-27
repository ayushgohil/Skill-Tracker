import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProfileService } from '../core/services/profile.service';
import { SubjectsService } from '../core/services/subjects.service';
import { TopicsService } from '../core/services/topics.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { Profile, SubjectWithTopics } from '../core/models';
import { ActivityHeatmapComponent } from './activity-heatmap/activity-heatmap.component';
import { ToastComponent } from '../shared/toast/toast.component';
import { staggerList, fadeSlideInOut } from '../core/animations/app.animations';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, ActivityHeatmapComponent, ToastComponent],
    templateUrl: './profile.component.html',
    animations: [staggerList, fadeSlideInOut]
})
export class ProfileComponent implements OnInit {
    profile = signal<Profile | null>(null);
    loading = signal(true);
    saving = signal(false);
    displayName = '';
    editingName = signal(false);
    totalTopics = signal(0);
    totalCompleted = signal(0);
    totalSubjects = signal(0);

    percent = computed(() =>
        this.totalTopics() ? Math.round((this.totalCompleted() / this.totalTopics()) * 100) : 0
    );
    userEmail = computed(() => this.auth.currentUser()?.email ?? '');
    memberSince = computed(() => {
        const p = this.profile();
        if (!p) return '';
        return new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    });

    joinYear = computed(() => {
        const p = this.profile();
        if (!p) return new Date().getFullYear();
        return new Date(p.created_at).getFullYear();
    });

    constructor(
        private profileService: ProfileService,
        private topicsService: TopicsService,
        private auth: AuthService,
        private toast: ToastService
    ) { }

    async ngOnInit() {
        this.loading.set(true);
        try {
            const [profile, subjects] = await Promise.all([
                this.profileService.getProfile(),
                this.topicsService.getSubjectsWithTopics()
            ]);
            this.profile.set(profile);
            this.displayName = profile.display_name ?? '';
            this.totalSubjects.set(subjects.length);
            this.totalTopics.set(subjects.reduce((s: number, c: SubjectWithTopics) => s + c.totalCount, 0));
            this.totalCompleted.set(subjects.reduce((s: number, c: SubjectWithTopics) => s + c.completedCount, 0));
        } catch {
            this.toast.error('Failed to load profile.');
        } finally {
            this.loading.set(false);
        }
    }

    async saveName() {
        if (!this.displayName.trim()) return;
        this.saving.set(true);
        try {
            await this.profileService.updateDisplayName(this.displayName.trim());
            this.profile.update(p => p ? { ...p, display_name: this.displayName.trim() } : p);
            this.editingName.set(false);
            this.toast.success('Display name updated.');
        } catch {
            this.toast.error('Failed to update name.');
        } finally {
            this.saving.set(false);
        }
    }

    logout() { this.auth.logout(); }
}