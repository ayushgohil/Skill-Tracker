// src/app/profile/profile.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../core/services/profile.service';
import { TopicsService } from '../core/services/topics.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { Profile } from '../core/models';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [FormsModule, RouterLink, ToastComponent],
    templateUrl: './profile.component.html'
})
export class ProfileComponent implements OnInit {
    profile = signal<Profile | null>(null);
    loading = signal(true);
    saving = signal(false);
    displayName = '';
    editingName = signal(false);
    totalTopics = signal(0);
    totalCompleted = signal(0);
    totalCategories = signal(0);

    percent = computed(() =>
        this.totalTopics() ? Math.round((this.totalCompleted() / this.totalTopics()) * 100) : 0
    );
    userEmail = computed(() => this.auth.currentUser()?.email ?? '');
    memberSince = computed(() => {
        const p = this.profile();
        if (!p) return '';
        return new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
            const [profile, categories] = await Promise.all([
                this.profileService.getProfile(),
                this.topicsService.getCategoriesWithTopics()
            ]);
            this.profile.set(profile);
            this.displayName = profile.display_name ?? '';
            this.totalCategories.set(categories.length);
            this.totalTopics.set(categories.reduce((s, c) => s + c.totalCount, 0));
            this.totalCompleted.set(categories.reduce((s, c) => s + c.completedCount, 0));
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