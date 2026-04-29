// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
    currentUser = signal<User | null>(null);
    loading = signal(true);

    constructor(private router: Router) {
        supabase.auth.getSession().then(({ data }) => {
            this.currentUser.set(data.session?.user ?? null);
            this.loading.set(false);
        });

        supabase.auth.onAuthStateChange((event, session) => {
            this.currentUser.set(session?.user ?? null);
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
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`
            }
        });
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
        await supabase.auth.signOut();
        this.router.navigate(['/auth/login']);
    }

    isLoggedIn(): boolean {
        return !!this.currentUser();
    }
}