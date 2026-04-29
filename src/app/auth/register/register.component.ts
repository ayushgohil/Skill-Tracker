// src/app/auth/register/register.component.ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './register.component.html'
})
export class RegisterComponent {
    email = '';
    password = '';
    loading = signal(false);
    googleLoading = signal(false);
    error = signal('');
    success = signal(false);
    showPassword = signal(false);

    constructor(private auth: AuthService) { }

    async loginWithGoogle() {
        this.googleLoading.set(true);
        this.error.set('');
        try {
            await this.auth.loginWithGoogle();
        } catch (e: any) {
            this.error.set(e.message ?? 'Google sign-in failed.');
            this.googleLoading.set(false);
        }
    }

    async submit() {
        if (!this.email || !this.password) { this.error.set('Fill in all fields.'); return; }
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.register(this.email, this.password);
            this.success.set(true);
        } catch (e: any) {
            if (e.message?.toLowerCase().includes('already registered') || e.message?.toLowerCase().includes('already exists')) {
                this.error.set('Account already exists. Please sign in.');
            } else {
                this.error.set(e.message ?? 'Registration failed.');
            }
        } finally {
            this.loading.set(false);
        }
    }
}