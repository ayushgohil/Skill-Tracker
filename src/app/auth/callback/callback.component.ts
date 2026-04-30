// src/app/auth/callback/callback.component.ts
// This component handles the OAuth redirect from Supabase.
// After Google sign-in, Supabase redirects here with tokens in the URL hash.
// We wait for Supabase to process the tokens, then navigate to /dashboard.
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '../../core/supabase.client';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-callback',
    standalone: true,
    template: `
        <div class="callback-container">
            <div class="spinner"></div>
            <p>Signing you in…</p>
        </div>
    `,
    styles: [`
        .callback-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            gap: 1rem;
            color: #a1a1aa;
            font-family: 'Inter', sans-serif;
            background: #09090b;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #27272a;
            border-top-color: #2563eb;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `]
})
export class CallbackComponent implements OnInit {
    constructor(private router: Router, private auth: AuthService) {}

    async ngOnInit() {
        // Supabase client automatically picks up the tokens from the URL hash
        // and exchanges them for a session. We just need to wait for it.
        const { data, error } = await supabase.auth.getSession();

        if (data.session?.user) {
            this.auth.currentUser.set(data.session.user);
            this.router.navigate(['/dashboard'], { replaceUrl: true });
        } else {
            // If something went wrong, redirect to login
            console.error('OAuth callback failed:', error);
            this.router.navigate(['/auth/login'], { replaceUrl: true });
        }
    }
}
