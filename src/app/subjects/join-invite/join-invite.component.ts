import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { InvitePreview } from '../../core/models';
import { supabase } from '../../core/supabase.client';

@Component({
    selector: 'app-join-invite',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="min-h-screen flex items-center justify-center p-4"
         style="background: var(--bg-0); color: var(--text-1);">
        
        <div class="w-full max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl border relative overflow-hidden"
             style="background: var(--surface-0); border-color: var(--border);">
            
            <!-- Glow background effect -->
            <div class="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
                 [style.background]="preview()?.subject_color || '#3b82f6'"></div>

            <!-- Loading State -->
            @if (loading()) {
                <div class="py-12 flex flex-col items-center justify-center gap-3">
                    <svg class="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <p class="text-xs" style="color: var(--text-3)">Loading invitation details...</p>
                </div>
            }

            <!-- Error State -->
            @else if (error()) {
                <div class="py-8 text-center space-y-4">
                    <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-red-500/10 text-red-400 text-2xl">
                        ⚠️
                    </div>
                    <div>
                        <h2 class="text-base font-semibold" style="color: var(--text-1)">Invalid Invitation</h2>
                        <p class="text-xs mt-1" style="color: var(--text-3)">{{ error() }}</p>
                    </div>
                    <a routerLink="/dashboard" class="btn-primary text-xs py-2 px-4 inline-block">
                        Return to Dashboard
                    </a>
                </div>
            }

            <!-- Preview & Join State -->
            @else if (preview()) {
                <div class="space-y-6">
                    
                    <!-- App Logo / Badge -->
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                            NL
                        </div>
                        <span class="text-xs font-semibold tracking-wide uppercase" style="color: var(--text-3)">
                            NextLyr Skill Tracker
                        </span>
                    </div>

                    <!-- Invite Header -->
                    <div>
                        <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
                             style="background: var(--surface-2); color: var(--text-2);">
                            <span>👥 Study Partner Invitation</span>
                        </div>
                        <h1 class="text-xl font-bold tracking-tight" style="color: var(--text-1)">
                            {{ preview()!.inviter_name }} invited you to collaborate
                        </h1>
                        <p class="text-xs mt-1" style="color: var(--text-3)">
                            You'll share a synchronized curriculum, view each other's progress, and inspect study notes.
                        </p>
                    </div>

                    <!-- Subject Card Preview -->
                    <div class="p-4 rounded-xl border flex items-center gap-4"
                         style="background: var(--surface-1); border-color: var(--border);">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0"
                             [style.background]="preview()!.subject_color + '25'"
                             [style.color]="preview()!.subject_color">
                            {{ preview()!.subject_name.charAt(0).toUpperCase() }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <h3 class="text-sm font-semibold truncate" style="color: var(--text-1)">
                                {{ preview()!.subject_name }}
                            </h3>
                            <div class="flex items-center gap-3 text-xs mt-1" style="color: var(--text-3)">
                                <span>📚 {{ preview()!.topic_count }} {{ preview()!.topic_count === 1 ? 'topic' : 'topics' }}</span>
                                <span>•</span>
                                <span>Per-subject sync</span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    @if (isLoggedIn()) {
                        <div class="space-y-2 pt-2">
                            <button (click)="acceptInvite()" [disabled]="joining()"
                                    class="w-full btn-primary py-3 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
                                @if (joining()) {
                                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    Joining Subject...
                                } @else {
                                    <span>Accept & Start Studying Together</span>
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                }
                            </button>
                            <a routerLink="/dashboard" class="w-full text-center block text-xs py-2" style="color: var(--text-3)">
                                Decline & Go to Dashboard
                            </a>
                        </div>
                    } @else {
                        <div class="space-y-3 pt-2">
                            <p class="text-xs text-center" style="color: var(--text-2)">
                                Sign in to your Skill Tracker account to accept this invite.
                            </p>
                            <a [routerLink]="['/auth/login']" [queryParams]="{ returnUrl: '/join/' + inviteCode }"
                               class="w-full btn-primary py-2.5 text-xs text-center block font-medium">
                                Sign In to Accept
                            </a>
                            <a [routerLink]="['/auth/register']" [queryParams]="{ returnUrl: '/join/' + inviteCode }"
                               class="w-full py-2.5 text-xs text-center block rounded-xl border transition-colors hover:bg-white/5"
                               style="border-color: var(--border); color: var(--text-1);">
                                Create Free Account
                            </a>
                        </div>
                    }

                </div>
            }

        </div>
    </div>
    `
})
export class JoinInviteComponent implements OnInit {
    inviteCode = '';
    preview = signal<InvitePreview | null>(null);
    loading = signal(true);
    joining = signal(false);
    error = signal<string | null>(null);
    isLoggedIn = signal(false);

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private collabService: CollaborationService,
        private toastService: ToastService,
        private authService: AuthService
    ) {}

    async ngOnInit() {
        this.inviteCode = this.route.snapshot.paramMap.get('code') || '';
        if (!this.inviteCode) {
            this.error.set('No invite code provided.');
            this.loading.set(false);
            return;
        }

        // Check if user is logged in
        const { data: { session } } = await supabase.auth.getSession();
        this.isLoggedIn.set(!!session);

        try {
            const data = await this.collabService.getInvitePreview(this.inviteCode);
            if (data?.error) {
                this.error.set(data.error);
            } else {
                this.preview.set(data);
            }
        } catch (err: any) {
            this.error.set(err.message || 'Failed to load invitation.');
        } finally {
            this.loading.set(false);
        }
    }

    async acceptInvite() {
        if (!this.inviteCode) return;
        this.joining.set(true);
        try {
            const res = await this.collabService.acceptInvite(this.inviteCode);
            if (res.success && res.subject_id) {
                this.toastService.show('Joined study subject successfully!', 'success');
                this.router.navigate(['/subjects', res.subject_id]);
            } else {
                this.toastService.show(res.error || 'Failed to join subject', 'error');
                if (res.subject_id) {
                    this.router.navigate(['/subjects', res.subject_id]);
                }
            }
        } catch (err: any) {
            this.toastService.show(err.message || 'Error joining subject', 'error');
        } finally {
            this.joining.set(false);
        }
    }
}
