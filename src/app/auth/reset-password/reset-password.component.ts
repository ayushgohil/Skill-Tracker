// src/app/auth/reset-password/reset-password.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-reset-password',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './reset-password.component.html'
})
export class ResetPasswordComponent implements OnInit {
    password = '';
    confirmPassword = '';
    loading = signal(false);
    error = signal('');
    success = signal(false);
    showPassword = signal(false);
    isLinkExpired = signal(false);

    constructor(private auth: AuthService, private router: Router) { }

    ngOnInit() {
        const hash = window.location.hash;
        if (hash.includes('error=') || hash.includes('error_description=')) {
            const params = new URLSearchParams(hash.substring(1));
            let desc = params.get('error_description')?.replace(/\+/g, ' ') || 'Reset password link expired or invalid.';
            if (desc.toLowerCase().includes('expired') || desc.toLowerCase().includes('invalid')) {
                desc = 'Reset password link expired. Please try again.';
            }
            this.error.set(desc);
            this.isLinkExpired.set(true);
        }
    }

    async submit() {
        if (!this.password || !this.confirmPassword) {
            this.error.set('Please fill in all fields.');
            return;
        }
        if (this.password.length < 6) {
            this.error.set('Password must be at least 6 characters.');
            return;
        }
        if (this.password !== this.confirmPassword) {
            this.error.set('Passwords do not match.');
            return;
        }

        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.updatePassword(this.password);
            this.success.set(true);
            // Optionally auto redirect after some time
            setTimeout(() => {
                this.router.navigate(['/dashboard']);
            }, 3000);
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to update password.');
        } finally {
            this.loading.set(false);
        }
    }
}
