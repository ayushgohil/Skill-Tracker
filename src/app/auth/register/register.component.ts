// src/app/auth/register/register.component.ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [FormsModule, RouterLink],
    template: `
    <div class="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div class="w-full max-w-md">

        <div class="text-center mb-10">
          <div class="inline-flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <span class="text-zinc-950 font-black text-lg">S</span>
            </div>
            <span class="text-white font-bold text-2xl tracking-tight">SkillTracker</span>
          </div>
          <p class="text-zinc-400 text-sm">Start tracking your learning</p>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 class="text-white font-semibold text-xl mb-6">Create account</h2>

          @if (error()) {
            <div class="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
              {{ error() }}
            </div>
          }

          @if (success()) {
            <div class="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-3 mb-5">
              Account created! Check your email to confirm, then sign in.
            </div>
          }

          <div class="space-y-4">
            <div>
              <label class="text-zinc-400 text-sm block mb-1.5">Email</label>
              <input
                [(ngModel)]="email"
                type="email"
                placeholder="you@example.com"
                class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
              />
            </div>

            <div>
              <label class="text-zinc-400 text-sm block mb-1.5">Password</label>
              <input
                [(ngModel)]="password"
                type="password"
                placeholder="Min 6 characters"
                (keydown.enter)="register()"
                class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
              />
            </div>

            <button
              (click)="register()"
              [disabled]="loading() || success()"
              class="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg py-2.5 text-sm transition-colors mt-2"
            >
              {{ loading() ? 'Creating account...' : 'Create account' }}
            </button>
          </div>

          <p class="text-zinc-500 text-sm text-center mt-6">
            Already have an account?
            <a routerLink="/auth/login" class="text-emerald-400 hover:text-emerald-300 transition-colors">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class RegisterComponent {
    email = '';
    password = '';
    loading = signal(false);
    error = signal('');
    success = signal(false);

    constructor(private auth: AuthService) { }

    async register() {
        if (!this.email || !this.password) {
            this.error.set('Please fill in all fields.');
            return;
        }
        this.loading.set(true);
        this.error.set('');
        try {
            await this.auth.signUp(this.email, this.password);
            this.success.set(true);
        } catch (e: any) {
            this.error.set(e.message ?? 'Registration failed.');
        } finally {
            this.loading.set(false);
        }
    }
}