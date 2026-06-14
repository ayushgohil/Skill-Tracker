// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabase.client';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
    currentUser = signal<User | null>(null);
    loading = signal(true);

    constructor(private router: Router, private cacheService: CacheService) {
        supabase.auth.getSession().then(({ data }) => {
            this.currentUser.set(data.session?.user ?? null);
            this.loading.set(false);
        });

        supabase.auth.onAuthStateChange((event, session) => {
            this.currentUser.set(session?.user ?? null);
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
                this.cacheService.clear();
            }
            if (event === 'PASSWORD_RECOVERY') {
                this.router.navigate(['/reset-password']);
            }
        });
    }

    async register(email: string, password: string) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // If identities is empty, it means the user already exists (Supabase protection)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }
    }

    async login(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async loginWithGoogle() {
        // Check if user previously enabled auto-connect Drive
        const autoConnect = await this.getAutoConnectDrivePref();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: autoConnect
                    ? 'https://www.googleapis.com/auth/drive.file'
                    : undefined,
                queryParams: autoConnect
                    ? { access_type: 'offline', prompt: 'consent' }
                    : {},
                redirectTo: `${window.location.origin}/auth/callback`
            }
        });
        if (error) throw error;
    }



    async connectGoogleDrive() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/drive.file',
                queryParams: { access_type: 'offline', prompt: 'consent' },
                redirectTo: `${window.location.origin}/auth/callback`
            }
        });
        if (error) throw error;
    }

    async getAutoConnectDriveSetting(): Promise<boolean> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const { data } = await supabase
            .from('profiles')
            .select('auto_connect_drive')
            .eq('id', user.id)
            .single();
        return data?.auto_connect_drive ?? false;
    }

    async setAutoConnectDrive(value: boolean): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
            .from('profiles')
            .update({ auto_connect_drive: value })
            .eq('id', user.id);
        // Cache in localStorage so loginWithGoogle() can read it before session
        localStorage.setItem('auto_connect_drive', value.toString());
    }

    // Fetch preference before user is logged in (from localStorage fallback)
    private async getAutoConnectDrivePref(): Promise<boolean> {
        // Try localStorage first (available before session loads)
        const cached = localStorage.getItem('auto_connect_drive');
        if (cached !== null) return cached === 'true';
        return false;
    }

    async sendPasswordReset(email: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
    }

    async updatePassword(password: string) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
    }

    async logout() {
        await supabase.auth.signOut();
        this.router.navigate(['/auth/login']);
    }

    isLoggedIn(): boolean {
        return !!this.currentUser();
    }
}