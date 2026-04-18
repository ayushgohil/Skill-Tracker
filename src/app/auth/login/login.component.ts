// src/app/auth/login/login.component.ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './login.component.html'
})
export class LoginComponent {
    email = '';
    password = '';
    loading = signal(false);
    error = signal('');

    constructor(private auth: AuthService, private router: Router) { }

    async submit() {
        if (!this.email || !this.password) { this.error.set('Fill in all fields.'); return; }
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.login(this.email, this.password);
            this.router.navigate(['/dashboard']);
        } catch (e: any) {
            this.error.set(e.message ?? 'Login failed.');
        } finally {
            this.loading.set(false);
        }
    }
}