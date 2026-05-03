// src/app/core/services/pomodoro.service.ts
import { Injectable, signal, computed } from '@angular/core';

export type TimerState = 'idle' | 'running' | 'paused' | 'break';

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
    }

    startBreak() {
        this.isBreakWaiting.set(false);
        this.state.set('break');
        this.timeRemaining.set(this.BREAK_MINUTES * 60);
        this.targetEndTime = Date.now() + (this.BREAK_MINUTES * 60 * 1000);
        this.startTick();
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
    }

    closeWidget() {
        this.isVisible.set(false);
        this.isFullScreen.set(false);
    }

    openWidget() {
        this.isVisible.set(true);
    }

    enterFullScreen() {
        this.isFullScreen.set(true);
        this.isVisible.set(true);
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
                icon: '/favicon.ico'
            });
        }

        if (this.state() === 'running') {
            // Wait for user to start break
            this.isBreakWaiting.set(true);
        } else if (this.state() === 'break') {
            // Stop after break
            this.stop();
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
