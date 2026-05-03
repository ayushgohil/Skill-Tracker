import { Component, OnInit, OnDestroy, effect, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PomodoroService } from '../../core/services/pomodoro.service';
import { fadeSlideInOut, scaleInOut } from '../../core/animations/app.animations';

@Component({
    selector: 'app-pomodoro',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './pomodoro.component.html',
    styleUrls: ['./pomodoro.css'],
    animations: [fadeSlideInOut, scaleInOut]
})
export class PomodoroComponent implements OnInit, OnDestroy {
    // Draggable state
    dragPosition = signal({ x: 0, y: 0 });
    isDragging = signal(false);
    private startX = 0;
    private startY = 0;

    constructor(public pomodoroService: PomodoroService) {
        // Handle fullscreen signal changes
        effect(() => {
            const isFull = this.pomodoroService.isFullScreen();
            if (isFull) {
                this.enterBrowserFullScreen();
                // Reset drag position when entering fullscreen
                this.dragPosition.set({ x: 0, y: 0 });
            } else {
                this.exitBrowserFullScreen();
            }
        });
    }

    ngOnInit() {
        this.pomodoroService.requestNotificationPermission();
        
        // Listen for browser fullscreen changes
        if (typeof document !== 'undefined') {
            document.addEventListener('fullscreenchange', this.onFullScreenChange);

            // Global mouse/touch move and end for smooth dragging
            window.addEventListener('mousemove', this.onMouseMove);
            window.addEventListener('mouseup', this.onMouseUp);
            window.addEventListener('touchmove', this.onTouchMove, { passive: false });
            window.addEventListener('touchend', this.onTouchUp);
        }
    }

    onDragStart(event: MouseEvent | TouchEvent) {
        if (this.pomodoroService.isFullScreen()) return;
        
        this.isDragging.set(true);
        const pos = event instanceof MouseEvent ? event : event.touches[0];
        this.startX = pos.clientX - this.dragPosition().x;
        this.startY = pos.clientY - this.dragPosition().y;
    }

    private onDragMove(event: MouseEvent | TouchEvent) {
        if (!this.isDragging()) return;
        
        const pos = event instanceof MouseEvent ? event : event.touches[0];
        this.dragPosition.set({
            x: pos.clientX - this.startX,
            y: pos.clientY - this.startY
        });
        
        if (event instanceof TouchEvent) {
            event.preventDefault();
        }
    }

    private onDragEnd() {
        this.isDragging.set(false);
    }

    ngOnDestroy() {
        if (typeof document !== 'undefined') {
            document.removeEventListener('fullscreenchange', this.onFullScreenChange);
            window.removeEventListener('mousemove', this.onMouseMove);
            window.removeEventListener('mouseup', this.onMouseUp);
            window.removeEventListener('touchmove', this.onTouchMove);
            window.removeEventListener('touchend', this.onTouchUp);
        }
    }

    private onFullScreenChange = () => {
        if (!document.fullscreenElement) {
            this.pomodoroService.exitFullScreen();
        }
    };

    private onMouseMove = (e: MouseEvent) => this.onDragMove(e);
    private onMouseUp = () => this.onDragEnd();
    private onTouchMove = (e: TouchEvent) => this.onDragMove(e);
    private onTouchUp = () => this.onDragEnd();

    private async enterBrowserFullScreen() {
        try {
            if (typeof document !== 'undefined' && !document.fullscreenElement) {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                }

                // Try to lock orientation to landscape
                if (typeof screen !== 'undefined' && (screen as any).orientation && (screen as any).orientation.lock) {
                    try {
                        await (screen as any).orientation.lock('landscape');
                    } catch (e) {
                        console.warn('Orientation lock failed', e);
                    }
                }
            }
        } catch (err) {
            console.error('Fullscreen entry failed', err);
        }
    }

    private exitBrowserFullScreen() {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
            document.exitFullscreen();
            
            // Unlock orientation
            if (typeof screen !== 'undefined' && (screen as any).orientation && (screen as any).orientation.unlock) {
                (screen as any).orientation.unlock();
            }
        }
    }

    toggleFullScreen() {
        if (this.pomodoroService.isFullScreen()) {
            this.pomodoroService.exitFullScreen();
        } else {
            this.pomodoroService.enterFullScreen();
        }
    }

    startBreak() {
        this.pomodoroService.startBreak();
    }

    toggle() {
        this.pomodoroService.togglePause();
    }

    stop() {
        this.pomodoroService.stop();
    }

    close() {
        this.pomodoroService.closeWidget();
    }

    // Helper for flip clock digits
    getDigits(val: number): string[] {
        return val.toString().padStart(2, '0').split('');
    }

    getMinutes(): number {
        return Math.floor(this.pomodoroService.timeRemaining() / 60);
    }

    getSeconds(): number {
        return this.pomodoroService.timeRemaining() % 60;
    }
}
