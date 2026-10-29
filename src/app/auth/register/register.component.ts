// src/app/auth/register/register.component.ts
import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { checkPasswordStrength } from '../password-strength';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './register.component.html'
})
export class RegisterComponent {
    email = '';
    /** A signal behind the scenes so the strength hint updates as you type. */
    private passwordValue = signal('');
    get password(): string { return this.passwordValue(); }
    set password(value: string) { this.passwordValue.set(value ?? ''); }

    strength = computed(() => checkPasswordStrength(this.passwordValue()));
    /** Colour of the filled bars for each level. */
    readonly strengthColors = ['', 'bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
    readonly strengthTextColors = ['', 'text-red-400', 'text-amber-400', 'text-lime-400', 'text-emerald-400'];
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