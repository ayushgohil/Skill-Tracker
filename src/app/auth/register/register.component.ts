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
    error = signal('');
    success = signal(false);

    constructor(private auth: AuthService) { }

    async submit() {
        if (!this.email || !this.password) { this.error.set('Fill in all fields.'); return; }
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.register(this.email, this.password);
            this.success.set(true);
        } catch (e: any) {
            this.error.set(e.message ?? 'Registration failed.');
        } finally {
            this.loading.set(false);
        }
    }
}