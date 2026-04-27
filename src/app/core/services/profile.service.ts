// src/app/core/services/profile.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models';

@Injectable({ providedIn: 'root' })
export class ProfileService {

    async getProfile(): Promise<Profile> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (error) throw error;
        return data as Profile;
    }

    async updateDisplayName(name: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: name })
            .eq('id', user.id);
        if (error) throw error;
    }
}