// src/app/core/services/pomodoro.service.ts
import { Injectable, signal, computed } from '@angular/core';

export type TimerState = 'idle' | 'running' | 'paused' | 'break';

/** What is saved in the browser so a session survives a page refresh. */
interface SavedSession {
    version: 1;
    /** 'running' = a focus session (running, paused or finished and waiting for a break). */
    state: 'running' | 'break';
    topicId: string | null;
    topicTitle: string | null;
    isBreakWaiting: boolean;
    visible: boolean;
    /** When the timer ends, as a clock time. Only set while it is counting down. */
    endTime: number | null;
    /** Seconds left. Only set while it is paused or finished. */
    remaining: number | null;
    savedAt: number;
}

const STORAGE_KEY = 'skilltracker.pomodoro.v1';
/** A saved session older than this is forgotten instead of coming back. */
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PomodoroService {

    // Config
    private readonly FOCUS_MINUTES = 25;
    private readonly BREAK_MINUTES = 5;

    // State
    state = signal<TimerState>('idle');
    timeRemaining = signal<number>(this.FOCUS_MINUTES * 60);
    activeTopicTitle = signal<string | null>(null);
    activeTopicId = signal<string | null>(null);
    isVisible = signal<boolean>(false);
    isFullScreen = signal<boolean>(false);
    isBreakWaiting = signal<boolean>(false);

    private isRunning = signal<boolean>(false);
    private timerInterval: any = null;
    private targetEndTime: number = 0;

    constructor() {
        this.restore();
    }

    // Computed formatting
    formattedTime = computed(() => {
        const totalSeconds = this.timeRemaining();
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    });

    startSession(topicId: string, title: string) {
        // If already running for this topic, just show it
        if (this.activeTopicId() === topicId && this.state() !== 'idle') {
            this.isVisible.set(true);
            this.isFullScreen.set(true);
            return;
        }

        this.stop(); // Reset any existing session

        this.activeTopicId.set(topicId);
        this.activeTopicTitle.set(title);
        this.timeRemaining.set(this.FOCUS_MINUTES * 60);
        this.targetEndTime = Date.now() + (this.FOCUS_MINUTES * 60 * 1000);
        this.state.set('running');
        this.isVisible.set(true);
        this.isFullScreen.set(true);
        this.isBreakWaiting.set(false);
        this.startTick();
        this.persist();
    }

    startBreak() {
        this.isBreakWaiting.set(false);
        this.state.set('break');
        this.timeRemaining.set(this.BREAK_MINUTES * 60);
        this.targetEndTime = Date.now() + (this.BREAK_MINUTES * 60 * 1000);
        this.startTick();
        this.persist();
    }

    togglePause() {
        if (this.state() === 'running' || this.state() === 'break') {
            if (this.isRunning()) {
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                }
                this.isRunning.set(false);
            } else {
                this.targetEndTime = Date.now() + (this.timeRemaining() * 1000);
                this.startTick();
            }
            this.persist();
        }
    }

    // New helper to check if paused
    isPaused = computed(() => (this.state() === 'running' || this.state() === 'break') && !this.isRunning());

    stop() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isRunning.set(false);
        this.targetEndTime = 0;
        this.state.set('idle');
        this.activeTopicId.set(null);
        this.activeTopicTitle.set(null);
        this.timeRemaining.set(this.FOCUS_MINUTES * 60);
        this.isVisible.set(false);
        this.isFullScreen.set(false);
        this.isBreakWaiting.set(false);
        this.persist(); // idle: forgets the saved session
    }

    closeWidget() {
        this.isVisible.set(false);
        this.isFullScreen.set(false);
        this.persist();
    }

    openWidget() {
        this.isVisible.set(true);
        this.persist();
    }

    enterFullScreen() {
        this.isFullScreen.set(true);
        this.isVisible.set(true);
        this.persist();
    }

    exitFullScreen() {
        this.isFullScreen.set(false);
    }

    private startTick() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.isRunning.set(true);
        this.timerInterval = setInterval(() => {
            const remaining = Math.round((this.targetEndTime - Date.now()) / 1000);
            if (remaining > 0) {
                this.timeRemaining.set(remaining);
            } else {
                this.timeRemaining.set(0);
                this.handleTimerComplete();
            }
        }, 1000);
    }

    private handleTimerComplete() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isRunning.set(false);

        this.playAlarmSound();

        // Simple notification if browser supports it
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Session Complete!', {
                body: this.state() === 'running' ? 'Time for a break!' : 'Break is over, back to focus!',
                icon: '/icons/icon-192.png'
            });
        }

        if (this.state() === 'running') {
            // Wait for user to start break
            this.isBreakWaiting.set(true);
            this.persist();
        } else if (this.state() === 'break') {
            // Stop after break
            this.stop();
        }
    }

    // ── Surviving a page refresh ───────────────────────────────

    /** Saves the current session in the browser (or forgets it when idle). Never throws. */
    private persist() {
        if (typeof localStorage === 'undefined') return;
        try {
            const state = this.state();
            if (state !== 'running' && state !== 'break') {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            const counting = this.isRunning();
            const session: SavedSession = {
                version: 1,
                state,
                topicId: this.activeTopicId(),
                topicTitle: this.activeTopicTitle(),
                isBreakWaiting: this.isBreakWaiting(),
                visible: this.isVisible(),
                endTime: counting ? this.targetEndTime : null,
                remaining: counting ? null : this.timeRemaining(),
                savedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch {
            // Storage can be full or blocked (private windows). The timer still works, it
            // just will not survive a refresh.
        }
    }

    /** Brings back a session saved before the page was refreshed or closed. */
    private restore() {
        if (typeof localStorage === 'undefined') return;

        let session: SavedSession | null = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            session = raw ? JSON.parse(raw) as SavedSession : null;
        } catch {
            session = null;
        }

        const now = Date.now();
        const valid = !!session
            && session.version === 1
            && (session.state === 'running' || session.state === 'break')
            && Number.isFinite(session.savedAt)
            && now - session.savedAt <= MAX_SESSION_AGE_MS
            && (session.endTime === null || Number.isFinite(session.endTime))
            && (session.remaining === null || Number.isFinite(session.remaining))
            && (session.endTime !== null || session.remaining !== null);

        if (!session || !valid) {
            if (session) this.clearSaved();
            return;
        }

        this.activeTopicId.set(session.topicId);
        this.activeTopicTitle.set(session.topicTitle);
        this.isVisible.set(session.visible !== false);
        this.isFullScreen.set(false); // browsers only allow full screen after a click

        if (session.endTime !== null) {
            // It was counting down: work out how much time is left now.
            const remaining = Math.round((session.endTime - now) / 1000);

            if (remaining > 0) {
                this.state.set(session.state);
                this.timeRemaining.set(remaining);
                this.targetEndTime = session.endTime;
                this.startTick();
            } else if (session.state === 'running') {
                // The focus time ended while the page was closed: offer the break, quietly.
                this.state.set('running');
                this.timeRemaining.set(0);
                this.isBreakWaiting.set(true);
                this.persist();
            } else {
                // The break ended while the page was closed: nothing left to show.
                this.stop();
            }
            return;
        }

        // It was paused, or finished and waiting for a break: bring it back as it was.
        this.state.set(session.state);
        this.timeRemaining.set(Math.max(0, Math.round(Number(session.remaining) || 0)));
        this.isBreakWaiting.set(session.isBreakWaiting === true);
    }

    private clearSaved() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }

    requestNotificationPermission() {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    private playAlarmSound() {
        if (typeof window !== 'undefined') {
            const audio = new Audio('/assets/alarm.mp3');
            // Using .play() returns a Promise. Catch any errors (e.g. browser blocks autoplay)
            audio.play().catch(error => {
                console.warn('Audio playback prevented by browser:', error);
            });
        }
    }
}
