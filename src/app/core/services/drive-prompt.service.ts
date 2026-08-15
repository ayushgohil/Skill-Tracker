import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from './auth.service';
import { GoogleDriveService } from './google-drive.service';
import { supabase } from '../supabase.client';

@Injectable({ providedIn: 'root' })
export class DrivePromptService {

    constructor(
        private auth: AuthService,
        private googleDrive: GoogleDriveService
    ) { }

    // Call this after login — handles auto-connect and first-time prompt
    async maybeShowFirstLoginPrompt(): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if user is Google login
        const isGoogleUser = user.app_metadata?.['provider'] === 'google';
        if (!isGoogleUser) return; // email users use manual Connect Drive

        // Check current setting
        const current = await this.auth.getAutoConnectDriveSetting();
        if (current) {
            // Auto-connect is enabled.
            // Check if we already have a stored refresh token — if yes,
            // the edge function can mint tokens silently. No redirect needed.
            const hasRefreshToken = await this.auth.hasStoredRefreshToken();

            if (hasRefreshToken) {
                // Silently verify Drive access via the edge function.
                // This is non-blocking — Drive will work on-demand.
                return;
            }

            // No refresh token stored yet — we need to redirect to Google
            // OAuth one time to capture it. This only happens once.
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.provider_refresh_token) {
                // The refresh token was provided in this session callback
                // (already saved by callback.component.ts), so we're good.
                return;
            }

            // Need to redirect to get the refresh token
            const redirected = sessionStorage.getItem('drive_redirected');
            if (!redirected) {
                sessionStorage.setItem('drive_redirected', 'true');
                localStorage.setItem('auto_connect_drive', 'true');
                await this.auth.connectGoogleDrive();
                return;
            } else {
                // Already redirected once in this session — don't loop
                sessionStorage.removeItem('drive_redirected');
            }
            return; // already enabled, no need to prompt
        }

        // Check if they've already been prompted
        const alreadyPrompted = localStorage.getItem(`drive_prompted_${user.id}`);
        if (alreadyPrompted) return;

        // Show the prompt
        const result = await Swal.fire({
            title: 'Connect Google Drive automatically?',
            html: `
        <div style="text-align:left; font-size:13px; color:#94a3b8; line-height:1.7">
          <p style="margin-bottom:12px">NextLyr can connect your Google Drive every time you log in — so your media is always accessible without an extra step.</p>
          <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; margin-bottom:4px">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
              <span style="color:#34d399; font-size:12px">✓</span>
              <span>Only files created by NextLyr are accessed</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
              <span style="color:#34d399; font-size:12px">✓</span>
              <span>We never read your existing Drive files</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px">
              <span style="color:#34d399; font-size:12px">✓</span>
              <span>You can turn this off anytime in Profile</span>
            </div>
          </div>
        </div>
      `,
            icon: undefined,
            showCancelButton: true,
            confirmButtonText: 'Yes, always connect',
            cancelButtonText: 'No thanks',
            background: '#0f172a',
            color: '#f1f5f9',
            confirmButtonColor: '#6366f1',
            cancelButtonColor: '#3f3f46',
            customClass: { popup: 'swal-dark-popup' }
        });

        // Mark as prompted regardless of choice
        localStorage.setItem(`drive_prompted_${user.id}`, 'true');

        if (result.isConfirmed) {
            await this.auth.setAutoConnectDrive(true);
            // Re-login with Drive scope now to capture the refresh token
            await this.auth.connectGoogleDrive();
        }
    }
}