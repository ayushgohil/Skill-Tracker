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
            const prevId = this.currentUser()?.id;
            const newId = session?.user?.id;
            this.currentUser.set(session?.user ?? null);
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || (prevId && newId && prevId !== newId)) {
                this.cacheService.clear();
            }
            if (event === 'PASSWORD_RECOVERY') {
                this.router.navigate(['/reset-password']);
            }
        });
    }

    async register(email: string, password: string) {
        this.cacheService.clear();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // If identities is empty, it means the user already exists (Supabase protection)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }
    }

    async login(email: string, password: string) {
        this.cacheService.clear();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) {
            this.currentUser.set(data.user);
        }
        this.cacheService.clear();
    }

    async ensureUser(): Promise<User> {
        const current = this.currentUser();
        if (current) return current;

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            this.currentUser.set(session.user);
            return session.user;
        }

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw error || new Error('Not authenticated');
        this.currentUser.set(user);
        return user;
    }

    async ensureUserId(): Promise<string> {
        const user = await this.ensureUser();
        return user.id;
    }

    async loginWithGoogle() {
        this.cacheService.clear();
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

    // ── Refresh Token Management ────────────────────────────────
    // The Google refresh token is stored in the user_google_tokens table, which the
    // browser cannot read or write (row level security with no policies). The
    // browser can only call three small database functions that act on the signed-in
    // user's own row and never return the token itself. Only the google-token Edge
    // Function can read the token. See supabase_migration_google_token_table.sql.

    // Store (or replace) the refresh token for the signed-in user
    async saveProviderRefreshToken(refreshToken: string): Promise<void> {
        const { error } = await supabase.rpc('save_google_refresh_token', {
            p_refresh_token: refreshToken
        });
        if (error) throw error;
    }

    // Check if a refresh token is stored. Returns only true/false, never the token.
    async hasStoredRefreshToken(): Promise<boolean> {
        const { data, error } = await supabase.rpc('has_google_refresh_token');
        if (error) {
            console.error('Failed to check stored refresh token:', error);
            return false;
        }
        return data === true;
    }

    // Clear the stored refresh token (when user disconnects Drive)
    async clearStoredRefreshToken(): Promise<void> {
        const { error } = await supabase.rpc('clear_google_refresh_token');
        if (error) throw error;
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
        this.cacheService.clear();
        await supabase.auth.signOut();
        this.currentUser.set(null);
        this.router.navigate(['/auth/login']);
    }

    isLoggedIn(): boolean {
        return !!this.currentUser();
    }
}