import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
    userProfile = signal<Profile | null>(null);

    constructor(private auth: AuthService) {}

    async getProfile(): Promise<Profile> {
        if (this.userProfile()) return this.userProfile()!;

        const userId = await this.auth.ensureUserId();

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;

        const profile = data as Profile;
        this.userProfile.set(profile);
        return profile;
    }

    async updateDisplayName(name: string): Promise<void> {
        const userId = await this.auth.ensureUserId();

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: name })
            .eq('id', userId);
        if (error) throw error;

        this.userProfile.update(p => p ? { ...p, display_name: name } : { id: userId, display_name: name, created_at: new Date().toISOString() });
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