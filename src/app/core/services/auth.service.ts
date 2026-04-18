// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '../supabase.client';
import { User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
    currentUser = signal<User | null>(null);

    constructor(private router: Router) {
        // Restore session on load
        supabase.auth.getSession().then(({ data }) => {
            this.currentUser.set(data.session?.user ?? null);
        });

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            this.currentUser.set(session?.user ?? null);
            if (!session) this.router.navigate(['/auth/login']);
        });
    }

    async signUp(email: string, password: string) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }

    async signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async signOut() {
        await supabase.auth.signOut();
    }

    isLoggedIn(): boolean {
        return !!this.currentUser();
    }
}