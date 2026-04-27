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
    
    private timerInterval: any = null;

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
            return;
        }

        this.stop(); // Reset any existing session
        
        this.activeTopicId.set(topicId);
        this.activeTopicTitle.set(title);
        this.timeRemaining.set(this.FOCUS_MINUTES * 60);
        this.state.set('running');
        this.isVisible.set(true);
        this.startTick();
    }

    togglePause() {
        if (this.state() === 'running') {
            this.state.set('paused');
            clearInterval(this.timerInterval);
        } else if (this.state() === 'paused') {
            this.state.set('running');
            this.startTick();
        }
    }

    stop() {
        clearInterval(this.timerInterval);
        this.state.set('idle');
        this.activeTopicId.set(null);
        this.activeTopicTitle.set(null);
        this.timeRemaining.set(this.FOCUS_MINUTES * 60);
        this.isVisible.set(false);
    }

    closeWidget() {
        this.isVisible.set(false);
    }

    openWidget() {
        this.isVisible.set(true);
    }

    private startTick() {
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.timeRemaining() > 0) {
                this.timeRemaining.update(t => t - 1);
            } else {
                this.handleTimerComplete();
            }
        }, 1000);
    }

    private handleTimerComplete() {
        clearInterval(this.timerInterval);
        
        // Simple notification if browser supports it
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Session Complete!', {
                body: this.state() === 'running' ? 'Time for a break!' : 'Break is over, back to focus!',
                icon: '/favicon.ico'
            });
        }

        if (this.state() === 'running') {
            // Start break
            this.state.set('break');
            this.timeRemaining.set(this.BREAK_MINUTES * 60);
            this.startTick();
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
}
