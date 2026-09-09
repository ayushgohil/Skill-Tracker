import { Component, input, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, SubjectPartnerInfo } from '../../core/models';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ToastService } from '../../core/services/toast.service';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-share-modal',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
         (click)="close.emit()">
        <div class="w-full max-w-md rounded-2xl p-4 sm:p-6 shadow-2xl relative border max-h-[90vh] overflow-y-auto"
             style="background: var(--surface-0); border-color: var(--border);"
             (click)="$event.stopPropagation()">
            
            <!-- Close Button -->
            <button (click)="close.emit()" 
                    class="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                    style="color: var(--text-3)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <!-- Header -->
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                     [style.background]="subject().color + '20'"
                     [style.color]="subject().color">
                    👥
                </div>
                <div>
                    <h3 class="text-base font-semibold" style="color: var(--text-1)">Study Partner</h3>
                    <p class="text-xs" style="color: var(--text-3)">Collaborate on "{{ subject().name }}"</p>
                </div>
            </div>

            <!-- Partnership State -->
            @if (partner()) {
                <!-- Active Partner Card -->
                <div class="p-4 rounded-xl border mb-4 space-y-3"
                     style="background: var(--surface-1); border-color: var(--border);">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-3 min-w-0 flex-1">
                            <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {{ partner()!.display_name.charAt(0).toUpperCase() }}
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-medium truncate" style="color: var(--text-1)">
                                    {{ partner()!.display_name }}
                                </div>
                                <div class="text-xs truncate" style="color: var(--text-3)">
                                    {{ partner()!.role === 'owner' ? 'Created this subject' : 'Studying together with you' }}
                                </div>
                            </div>
                        </div>
                        <span class="badge badge-green text-xs flex-shrink-0">Active Partner</span>
                    </div>

                    @if (partnerPercent() !== undefined) {
                    <div>
                        <div class="flex justify-between text-xs mb-1" style="color: var(--text-3)">
                            <span>{{ partner()!.display_name }}'s Progress</span>
                            <span class="font-medium" style="color: var(--text-1)">{{ partnerPercent() }}%</span>
                        </div>
                        <div class="w-full h-1.5 rounded-full overflow-hidden" style="background: var(--surface-2)">
                            <div class="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                 [style.width.%]="partnerPercent()"></div>
                        </div>
                    </div>
                    }
                </div>

                <!-- Shared Subject Settings / Unshare -->
                <div class="pt-2 border-t flex flex-col gap-2" style="border-color: var(--border);">
                    @if (isOwner()) {
                        <button (click)="onRemovePartner()" 
                                class="w-full py-2 px-4 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center justify-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Remove {{ partner()!.display_name }}
                        </button>
                    } @else {
                        <button (click)="onLeaveSubject()" 
                                class="w-full py-2 px-4 rounded-xl text-xs font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-all flex items-center justify-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Leave Shared Subject
                        </button>
                    }
                </div>

            } @else {
                <!-- Unshared / Invite Generation State -->
                <div class="space-y-4">
                    <p class="text-xs leading-relaxed" style="color: var(--text-2)">
                        Invite a friend or colleague to study this subject together. You'll share the curriculum (topics & subtopics), see each other's completion percentage, and can view each other's notes.
                    </p>

                    @if (inviteUrl()) {
                        <div class="space-y-2">
                            <label class="text-xs font-medium" style="color: var(--text-3)">Shareable Invite Link</label>
                            <div class="flex items-center gap-2">
                                <input type="text" readonly [value]="inviteUrl()"
                                       class="input text-xs flex-1 min-w-0 py-2 px-3 font-mono selection:bg-blue-500/30"
                                       (click)="$any($event.target).select()" />
                                <button (click)="copyInviteLink()"
                                        class="btn-primary text-xs py-2 px-3 flex-shrink-0 flex items-center gap-1.5">
                                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    {{ copied() ? 'Copied!' : 'Copy' }}
                                </button>
                            </div>
                            <p class="text-[11px]" style="color: var(--text-4)">
                                ⏱ {{ expiresInText() }}. Once your partner joins, this subject will be synchronized for both of you.
                            </p>
                        </div>
                    } @else {
                        <button (click)="generateInvite()" [disabled]="generating()"
                                class="w-full btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2">
                            @if (generating()) {
                                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                Creating Invite...
                            } @else {
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                Generate Invite Link
                            }
                        </button>
                    }
                </div>
            }

        </div>
    </div>
    `
})
export class ShareModalComponent implements OnInit {
    subject = input.required<Subject>();
    partner = input<SubjectPartnerInfo | null>(null);
    partnerPercent = input<number | undefined>(undefined);
    isOwner = input<boolean>(true);

    close = output<void>();
    partnerChanged = output<void>();

    inviteUrl = signal<string>('');
    inviteExpiresAt = signal<string | null>(null);
    generating = signal<boolean>(false);
    copied = signal<boolean>(false);

    expiresInText = computed(() => {
        const exp = this.inviteExpiresAt();
        if (!exp) return 'Link expires in 7 days';
        const diff = new Date(exp).getTime() - Date.now();
        if (diff <= 0) return 'Invite link has expired';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        if (days > 1) return `Link expires in ${days} days`;
        if (days === 1) return `Link expires in 1 day`;
        if (hours > 1) return `Link expires in ${hours} hours`;
        const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
        return `Link expires in ${mins} minute${mins === 1 ? '' : 's'}`;
    });

    constructor(
        private collabService: CollaborationService,
        private toastService: ToastService
    ) { }

    async ngOnInit() {
        if (!this.partner()) {
            // Check if an active invite link already exists without creating a new one
            try {
                const existing = await this.collabService.getActiveInvite(this.subject().id);
                if (existing) {
                    this.inviteUrl.set(existing.inviteUrl);
                    this.inviteExpiresAt.set(existing.expiresAt);
                }
            } catch (err) {
                // Not a blocker, user can click generate
            }
        }
    }

    async generateInvite() {
        this.generating.set(true);
        try {
            const res = await this.collabService.createOrGetInvite(this.subject().id);
            this.inviteUrl.set(res.inviteUrl);
            this.inviteExpiresAt.set(res.expiresAt);
            this.toastService.show('Invite link generated!', 'success');
        } catch (err: any) {
            this.toastService.show(err.message || 'Failed to create invite link', 'error');
        } finally {
            this.generating.set(false);
        }
    }

    async copyInviteLink() {
        if (!this.inviteUrl()) return;
        try {
            await navigator.clipboard.writeText(this.inviteUrl());
            this.copied.set(true);
            this.toastService.show('Invite link copied to clipboard!', 'success');
            setTimeout(() => this.copied.set(false), 2500);
        } catch {
            this.toastService.show('Please copy the URL manually', 'info');
        }
    }

    async onRemovePartner() {
        const p = this.partner();
        if (!p) return;

        const result = await Swal.fire({
            title: `Remove ${p.display_name}?`,
            text: `They will no longer have access to this shared subject. Their personal progress and notes will remain intact in their account.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#3f3f46',
            confirmButtonText: 'Yes, remove partner',
            background: '#18181b',
            color: '#f4f4f5'
        });

        if (result.isConfirmed) {
            try {
                await this.collabService.removePartner(this.subject().id, p.id);
                this.toastService.show('Partner removed', 'success');
                this.partnerChanged.emit();
                this.close.emit();
            } catch (err: any) {
                this.toastService.show(err.message || 'Failed to remove partner', 'error');
            }
        }
    }

    async onLeaveSubject() {
        const result = await Swal.fire({
            title: 'Leave Shared Subject?',
            text: 'This subject will be removed from your dashboard. Your personal progress will remain in your database history.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#3f3f46',
            confirmButtonText: 'Yes, leave subject',
            background: '#18181b',
            color: '#f4f4f5'
        });

        if (result.isConfirmed) {
            try {
                await this.collabService.leaveSubject(this.subject().id);
                this.toastService.show('Left shared subject', 'info');
                this.partnerChanged.emit();
                this.close.emit();
            } catch (err: any) {
                this.toastService.show(err.message || 'Failed to leave subject', 'error');
            }
        }
    }
}
