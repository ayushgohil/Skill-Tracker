import { Injectable } from '@angular/core';
import { driver } from 'driver.js';
import { AuthService } from './auth.service';
import { ProfileService } from './profile.service';
import Swal from 'sweetalert2';

export type TourPhase =
    | 'phase_1_dashboard'
    | 'phase_2_profile'
    | 'phase_3_dashboard_return'
    | 'phase_4_add_subject'
    | 'phase_5_subject_card'
    | 'phase_6_subject_detail'
    | 'phase_7_final'
    | 'completed';

const TOUR_ICONS = {
    welcome: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-blue-500"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    metrics: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-emerald-500"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>',
    stats: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-blue-600"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    heatmap: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-orange-500"><path d="M12 2c1 2 2 3.5 2 5.5s-1 3-2 3.5c-1-.5-2-1.5-2-3.5S11 4 12 2Z"/><path d="M12 11c3.5 0 7 2 7 6.5s-3.5 4.5-7 4.5-7-2-7-6.5 3.5-6.5 7-6.5Z"/></svg>',
    home: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-indigo-500"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    add: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-blue-500"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="18" y1="12" y2="12"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-amber-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
    palette: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-violet-500"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.647-.694 1.647-1.647 0-.443-.187-.844-.468-1.161-.274-.31-.444-.707-.444-1.121 0-.898.73-1.647 1.647-1.647H16c3.314 0 6-2.686 6-6 0-4.97-4.477-9-10-9Z"/></svg>',
    rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-rose-500"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"/><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"/></svg>',
    target: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-blue-500"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-red-500"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-slate-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    back: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-slate-600"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-emerald-600"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
    timer: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-rose-600"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="12" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>'
};

@Injectable({ providedIn: 'root' })
export class TourService {

    private currentDriver: any;

    constructor(private authService: AuthService, private profileService: ProfileService) {}

    /** Returns current tour phase for external checks */
    public getCurrentPhase(): TourPhase | null {
        const userId = this.authService.currentUser()?.id;
        if (!userId) return null;
        return (localStorage.getItem(`tour_phase_${userId}`) as TourPhase) || null;
    }

    /** Returns true if the tour is actively running (not completed and not null) */
    public isTourActive(): boolean {
        const phase = this.getCurrentPhase();
        return phase !== null && phase !== 'completed';
    }

    /** Force closes the tour and marks it completed (used on logout/abort) */
    public forceCloseTour() {
        const userId = this.authService.currentUser()?.id;
        if (userId) {
            this.setPhase(userId, 'completed');
        }
        if (this.currentDriver) {
            this.currentDriver.destroy();
            this.currentDriver = null;
        }
    }

    public checkAndRunTour(route: 'dashboard' | 'profile' | 'subject-detail') {
        const userId = this.authService.currentUser()?.id;
        if (!userId) return;

        // Ensure we only tour fresh accounts (created within 60 mins)
        const profile = this.profileService.userProfile();
        if (profile && profile.created_at) {
            const created = new Date(profile.created_at);
            const now = new Date();
            if ((now.getTime() - created.getTime()) / (1000 * 60) > 60) {
                localStorage.setItem(`tour_phase_${userId}`, 'completed');
                return;
            }
        }

        // Initialize state if not present
        let currentPhase = localStorage.getItem(`tour_phase_${userId}`) as TourPhase;
        if (!currentPhase) {
            currentPhase = 'phase_1_dashboard';
            localStorage.setItem(`tour_phase_${userId}`, currentPhase);
        }

        if (currentPhase === 'completed') return;

        // Route-based dispatch
        if (route === 'dashboard') {
            if (currentPhase === 'phase_1_dashboard') {
                setTimeout(() => this.showTourPrompt(userId), 600);
            } else if (currentPhase === 'phase_3_dashboard_return') {
                setTimeout(() => this.runPhase3(userId), 600);
            } else if (currentPhase === 'phase_4_add_subject') {
                setTimeout(() => this.runPhase4(userId), 600);
            } else if (currentPhase === 'phase_5_subject_card') {
                setTimeout(() => this.runPhase5(userId), 600);
            } else if (currentPhase === 'phase_7_final') {
                setTimeout(() => this.runPhase7(userId), 600);
            }
        } else if (route === 'profile') {
            if (currentPhase === 'phase_2_profile') {
                setTimeout(() => this.runPhase2(userId), 600);
            }
        } else if (route === 'subject-detail') {
            if (currentPhase === 'phase_6_subject_detail') {
                setTimeout(() => this.runPhase6(userId), 600);
            }
        }
    }

    // ════════════════════════════════════════════════════
    //  INITIAL PROMPT — Ask user to start or skip
    // ════════════════════════════════════════════════════
    private async showTourPrompt(userId: string) {
        const result = await Swal.fire({
            title: 'Welcome! 👋',
            html: `
                <p style="font-size: 0.95rem; color: #434654; font-weight: 500; line-height: 1.6;">
                    Would you like a quick tour of the app? It only takes a minute and we'll walk you through everything.
                </p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Start Tour 🚀',
            cancelButtonText: 'Skip, I\'ll explore',
            confirmButtonColor: '#1a56db',
            cancelButtonColor: '#737686',
            allowOutsideClick: false,
            customClass: {
                popup: 'tour-completion-popup',
                confirmButton: 'tour-completion-btn',
                title: 'tour-completion-title'
            }
        });

        if (result.isConfirmed) {
            this.runPhase1(userId);
        } else {
            this.setPhase(userId, 'completed');
        }
    }

    // ════════════════════════════════════════════════════
    //  PHASE 1 — Dashboard Welcome
    // ════════════════════════════════════════════════════
    private runPhase1(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                popover: {
                    title: `<div class="tour-title-flex"><span>Welcome to Skill Tracker!</span> ${TOUR_ICONS.welcome}</div>`,
                    description: 'Let\'s take a quick tour to set up your learning environment. Just follow along — it only takes a minute!',
                    side: "over",
                    align: 'center'
                }
            },
            {
                element: '#tour-metrics',
                popover: {
                    title: `<div class="tour-title-flex"><span>Your Progress at a Glance</span> ${TOUR_ICONS.metrics}</div>`,
                    description: 'These cards show your overall mastery percentage, day streak, and total XP earned.',
                    side: "bottom",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                element: '#tour-profile',
                popover: {
                    title: 'Your Profile',
                    description: 'Let\'s visit your profile first. Click your avatar!',
                    side: "bottom",
                    align: 'end'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            this.setPhase(userId, 'phase_2_profile');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            }
        ]);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 2 — Profile Exploration
    // ════════════════════════════════════════════════════
    private runPhase2(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                element: '#tour-profile-stats',
                popover: {
                    title: `<div class="tour-title-flex"><span>Your Stats</span> ${TOUR_ICONS.stats}</div>`,
                    description: 'Track your total subjects, topics completed, and mastery level here.',
                    side: "bottom",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                element: '#tour-profile-heatmap',
                popover: {
                    title: `<div class="tour-title-flex"><span>Activity Heatmap</span> ${TOUR_ICONS.heatmap}</div>`,
                    description: 'Consistency is everything. This heatmap lights up as you learn every day.',
                    side: "top",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                element: '#tour-nav-home',
                popover: {
                    title: `<div class="tour-title-flex"><span>Back to Home</span> ${TOUR_ICONS.home}</div>`,
                    description: 'Great! Now click Home to head back to your dashboard.',
                    side: "top",
                    align: 'center'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            this.setPhase(userId, 'phase_3_dashboard_return');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            }
        ]);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 3 — Dashboard Return → Add Subject
    // ════════════════════════════════════════════════════
    private runPhase3(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                element: '#tour-add-subject',
                popover: {
                    title: `<div class="tour-title-flex"><span>Add a Subject</span> ${TOUR_ICONS.add}</div>`,
                    description: 'Time to create your first subject! Click here to get started.',
                    side: "left",
                    align: 'center'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            this.setPhase(userId, 'phase_4_add_subject');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);

                            // The bottom sheet opens — trigger Phase 4 inside it
                            setTimeout(() => this.runPhase4(userId), 600);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            }
        ]);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 4 — Inside Add Subject Sheet
    // ════════════════════════════════════════════════════
    private runPhase4(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                element: '#tour-subject-name',
                popover: {
                    title: `<div class="tour-title-flex"><span>Name Your Subject</span> ${TOUR_ICONS.edit}</div>`,
                    description: 'Give it a name like "Programming", "Design", or "Music".',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#tour-subject-icons',
                popover: {
                    title: `<div class="tour-title-flex"><span>Pick an Icon</span> ${TOUR_ICONS.palette}</div>`,
                    description: 'Choose a visual identity that represents this subject.',
                    side: "top",
                    align: 'center'
                }
            },
            {
                element: '#tour-subject-create',
                popover: {
                    title: `<div class="tour-title-flex"><span>Create It!</span> ${TOUR_ICONS.rocket}</div>`,
                    description: 'Fill in a name, then click here to create your subject!',
                    side: "top",
                    align: 'center'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            // Move to phase 5 — the dashboard component will trigger it after subject is created
                            this.setPhase(userId, 'phase_5_subject_card');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            }
        ]);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 5 — Subject Card (Edit/Delete + Open)
    // ════════════════════════════════════════════════════
    private runPhase5(userId: string) {
        const driverObj = this.createDriver(userId);

        // Dynamic: find the first subject card on the page
        const firstSubjectCard = document.querySelector('[data-tour-subject-card]');
        const firstEditBtn = document.querySelector('[data-tour-edit-subject]');
        const firstDeleteBtn = document.querySelector('[data-tour-delete-subject]');

        const steps: any[] = [];

        if (firstSubjectCard) {
            steps.push({
                element: '[data-tour-subject-card]',
                popover: {
                    title: `<div class="tour-title-flex"><span>Your Subject Card</span> ${TOUR_ICONS.target}</div>`,
                    description: 'Each subject shows its name, progress bar, and topic count. Tap it to dive in!',
                    side: "bottom",
                    align: 'center'
                },
                disableActiveInteraction: true
            });
        }

        if (firstEditBtn) {
            steps.push({
                element: '[data-tour-edit-subject]',
                popover: {
                    title: `<div class="tour-title-flex"><span>Edit Subject</span> ${TOUR_ICONS.edit}</div>`,
                    description: 'You can rename or change the color of any subject here.',
                    side: "left",
                    align: 'center'
                },
                disableActiveInteraction: true
            });
        }

        if (firstDeleteBtn) {
            steps.push({
                element: '[data-tour-delete-subject]',
                popover: {
                    title: `<div class="tour-title-flex"><span>Delete Subject</span> ${TOUR_ICONS.delete}</div>`,
                    description: 'No longer need a subject? You can remove it here.',
                    side: "left",
                    align: 'center'
                },
                disableActiveInteraction: true
            });
        }

        // Final step: click the card to navigate
        if (firstSubjectCard) {
            steps.push({
                element: '[data-tour-subject-card]',
                popover: {
                    title: 'Open Your Subject',
                    description: 'Now click the card to open it and see your topics!',
                    side: "bottom",
                    align: 'center'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            this.setPhase(userId, 'phase_6_subject_detail');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            });
        }

        if (steps.length === 0) {
            // No subject card found — skip to phase 7
            this.setPhase(userId, 'phase_7_final');
            this.runPhase7(userId);
            return;
        }

        driverObj.setSteps(steps);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 6 — Subject Detail (Add Topic, Search, etc.)
    // ════════════════════════════════════════════════════
    private runPhase6(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                element: '#tour-add-topic',
                popover: {
                    title: `<div class="tour-title-flex"><span>Add Topics</span> ${TOUR_ICONS.add}</div>`,
                    description: 'Break down your subject into topics. Each topic tracks a specific skill or concept.',
                    side: "top",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                element: '#tour-search-topics',
                popover: {
                    title: `<div class="tour-title-flex"><span>Search & Sort</span> ${TOUR_ICONS.search}</div>`,
                    description: 'Quickly find topics or sort them by depth and completion status.',
                    side: "bottom",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                element: '#tour-back-btn',
                popover: {
                    title: `<div class="tour-title-flex"><span>Almost Done!</span> ${TOUR_ICONS.back}</div>`,
                    description: 'Head back to the dashboard for the final steps.',
                    side: "bottom",
                    align: 'start'
                },
                onHighlighted: (el: Element) => {
                    if (el) {
                        const handler = () => {
                            this.setPhase(userId, 'phase_7_final');
                            driverObj.destroy();
                            el.removeEventListener('click', handler);
                        };
                        el.addEventListener('click', handler);
                    }
                }
            }
        ]);
        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  PHASE 7 — Final Overview (Weekly, Pomodoro, Done)
    // ════════════════════════════════════════════════════
    private runPhase7(userId: string) {
        const driverObj = this.createDriver(userId);

        driverObj.setSteps([
            {
                element: '#tour-weekly-nav',
                popover: {
                    title: `<div class="tour-title-flex"><span>Weekly Reviews</span> ${TOUR_ICONS.calendar}</div>`,
                    description: 'Review your learning progress every week. Star topics to focus on and track your consistency.',
                    side: "top",
                    align: 'center'
                },
                disableActiveInteraction: true
            },
            {
                popover: {
                    title: `<div class="tour-title-flex"><span>Pomodoro Timer</span> ${TOUR_ICONS.timer}</div>`,
                    description: 'Inside any topic, you can start a 25-minute focused study session with the built-in Pomodoro timer. Stay focused, take breaks, repeat!',
                    side: "over",
                    align: 'center'
                }
            },
            {
                popover: {
                    title: `<div class="tour-title-flex"><span>You're Ready!</span> ${TOUR_ICONS.check}</div>`,
                    description: 'That\'s everything you need to know. Start adding topics, track your progress, and build real skills. Click "Done" to finish the tour!',
                    side: "over",
                    align: 'center'
                }
            }
        ]);

        // Override: When tour finishes, show the celebration
        const origDestroy = driverObj.destroy.bind(driverObj);
        let celebrationShown = false;

        driverObj.setConfig({
            ...driverObj.getConfig(),
            onNextClick: () => {
                if (!driverObj.hasNextStep()) {
                    // Last step — complete the tour
                    this.setPhase(userId, 'completed');
                    origDestroy();
                    if (!celebrationShown) {
                        celebrationShown = true;
                        setTimeout(() => this.showCompletionCelebration(), 400);
                    }
                } else {
                    driverObj.moveNext();
                }
            }
        });

        driverObj.drive();
    }

    // ════════════════════════════════════════════════════
    //  CELEBRATION MODAL
    // ════════════════════════════════════════════════════
    private showCompletionCelebration() {
        Swal.fire({
            icon: 'success',
            title: '🎉 You\'re All Set!',
            html: `
                <div style="text-align:center; padding: 8px 0;">
                    <p style="font-size: 1rem; color: #434654; font-weight: 500; line-height: 1.6; margin-bottom: 16px;">
                        Your learning journey starts now. Every expert was once a beginner — the key is to stay consistent.
                    </p>
                    <div style="background: linear-gradient(135deg, #f0f9ff, #ede9fe); border-radius: 16px; padding: 16px; margin-bottom: 8px;">
                        <p style="font-size: 0.95rem; color: #1a56db; font-weight: 700; font-style: italic; margin: 0;">
                            "The beautiful thing about learning is that nobody can take it away from you."
                        </p>
                        <p style="font-size: 0.8rem; color: #737686; font-weight: 600; margin-top: 8px; margin-bottom: 0;">— B.B. King</p>
                    </div>
                </div>
            `,
            confirmButtonText: 'Let\'s Go! 🚀',
            confirmButtonColor: '#1a56db',
            customClass: {
                popup: 'tour-completion-popup',
                confirmButton: 'tour-completion-btn',
                title: 'tour-completion-title'
            }
        });
    }

    // ════════════════════════════════════════════════════
    //  DRIVER FACTORY
    // ════════════════════════════════════════════════════
    private createDriver(userId?: string) {
        this.currentDriver = driver({
            showProgress: true,
            showButtons: ['next', 'previous', 'close'],
            animate: true,
            allowClose: true,
            allowKeyboardControl: true,
            overlayOpacity: 0.75,
            stagePadding: 8,
            stageRadius: 24,
            disableActiveInteraction: false,
            onCloseClick: () => {
                // Skip the entire tour
                if (userId) {
                    this.setPhase(userId, 'completed');
                }
                if (this.currentDriver) {
                    this.currentDriver.destroy();
                }
            },
            onDestroyStarted: () => {
                // Block accidental destruction from overlay clicks
            }
        });
        return this.currentDriver;
    }

    // ════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════
    private setPhase(userId: string, phase: TourPhase) {
        localStorage.setItem(`tour_phase_${userId}`, phase);
    }
}
