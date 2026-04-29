// src/app/core/services/profile.service.ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
    userProfile = signal<Profile | null>(null);

    async getProfile(): Promise<Profile> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (error) throw error;
        
        const profile = data as Profile;
        this.userProfile.set(profile);
        return profile;
    }

    async updateDisplayName(name: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: name })
            .eq('id', user.id);
        if (error) throw error;

        this.userProfile.update(p => p ? { ...p, display_name: name } : { id: user.id, display_name: name, created_at: new Date().toISOString(), email: user.email ?? '' });
    }
}