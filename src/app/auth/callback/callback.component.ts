import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '../../core/supabase.client';
import { AuthService } from '../../core/services/auth.service';
import { DrivePromptService } from '../../core/services/drive-prompt.service';

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
    constructor(
        private router: Router,
        private auth: AuthService,
        private drivePrompt: DrivePromptService
    ) { }

    async ngOnInit() {
        const { data, error } = await supabase.auth.getSession();

        if (data.session?.user) {
            this.auth.currentUser.set(data.session.user);

            // ── Capture & store Google refresh token ─────────────────
            // The provider_refresh_token is ONLY available right after
            // the OAuth redirect — Supabase does not persist it.
            // We store it in the profiles table so the edge function
            // can use it later to mint fresh access tokens.
            if (data.session.provider_refresh_token) {
                try {
                    await this.auth.saveProviderRefreshToken(data.session.provider_refresh_token);
                } catch (err) {
                    console.error('Failed to save provider refresh token:', err);
                    // Non-fatal — the user can still use the app, just may need
                    // to re-auth Drive later
                }
            }

            await this.drivePrompt.maybeShowFirstLoginPrompt();
            this.router.navigate(['/dashboard'], { replaceUrl: true });
        } else {
            console.error('OAuth callback failed:', error);
            this.router.navigate(['/auth/login'], { replaceUrl: true });
        }
    }
}