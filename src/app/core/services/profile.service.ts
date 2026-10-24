import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
    userProfile = signal<Profile | null>(null);

    constructor(
        private auth: AuthService,
        private cacheService: CacheService
    ) {
        this.cacheService.onClear(() => {
            this.userProfile.set(null);
        });
    }

    clearProfile(): void {
        this.userProfile.set(null);
        this.cacheService.clear('user_profile');
    }

    async getProfile(forceRefresh = false): Promise<Profile> {
        if (!forceRefresh) {
            const current = this.userProfile();
            const currentUserId = this.auth.currentUser()?.id;
            if (current && (!currentUserId || current.id === currentUserId)) {
                return current;
            }

            const cached = this.cacheService.get('user_profile') as Profile | null;
            if (cached && (!currentUserId || cached.id === currentUserId)) {
                this.userProfile.set(cached);
                return cached;
            }
        }

        const userId = await this.auth.ensureUserId();

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;

        const profile = data as Profile;
        this.userProfile.set(profile);
        this.cacheService.set('user_profile', profile);
        return profile;
    }

    async updateDisplayName(name: string): Promise<void> {
        const userId = await this.auth.ensureUserId();

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: name })
            .eq('id', userId);
        if (error) throw error;

        this.userProfile.update(p => {
            const updated = p ? { ...p, display_name: name } : { id: userId, display_name: name, created_at: new Date().toISOString() };
            this.cacheService.set('user_profile', updated);
            return updated;
        });
    }

    async deleteAccount(): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

        const response = await fetch(
            `${environment.supabaseUrl}/functions/v1/delete-account`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error ?? 'Failed to delete account');
        }
    }
}