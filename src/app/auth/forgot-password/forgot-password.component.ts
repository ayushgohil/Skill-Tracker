// src/app/auth/forgot-password/forgot-password.component.ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './forgot-password.component.html'
})
export class ForgotPasswordComponent {
    email = '';
    loading = signal(false);
    error = signal('');
    success = signal(false);

    constructor(private auth: AuthService) { }

    async submit() {
        if (!this.email.trim()) { this.error.set('Please enter your email.'); return; }
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.sendPasswordReset(this.email.trim());
            this.success.set(true);
        } catch (e: any) {
            this.error.set(e.message ?? 'Failed to send reset email.');
        } finally {
            this.loading.set(false);
        }
    }
}
