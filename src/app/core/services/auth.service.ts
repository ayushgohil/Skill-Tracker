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

        supabase.auth.onAuthStateChange((_event, session) => {
            this.currentUser.set(session?.user ?? null);
        });
    }

    async register(email: string, password: string) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }

    async login(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
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