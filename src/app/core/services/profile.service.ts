// src/app/core/services/profile.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models';

@Injectable({ providedIn: 'root' })
export class ProfileService {

    async getProfile(): Promise<Profile> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .single();
        if (error) throw error;
        return data as Profile;
    }

    async updateDisplayName(name: string): Promise<void> {
        const { error } = await supabase
            .from('profiles')
            .update({ display_name: name });
        if (error) throw error;
    }
}