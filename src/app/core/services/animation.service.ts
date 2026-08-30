// src/app/core/services/animation.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import gsap from 'gsap';
import confetti from 'canvas-confetti';

@Injectable({
    providedIn: 'root'
})
export class AnimationService {
    private isBrowser: boolean;

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    /**
     * Animate a numeric element smoothly from an initial number to a target number
     * using GSAP's power3.out easing curve.
     */
    animateNumber(
        target: { value: number },
        toValue: number,
        onUpdate: (current: number) => void,
        duration = 1.0
    ): gsap.core.Tween | null {
        if (!this.isBrowser) {
            onUpdate(toValue);
            return null;
        }

        return gsap.to(target, {
            value: toValue,
            duration,
            ease: 'power3.out',
            onUpdate: () => onUpdate(Math.round(target.value))
        });
    }

    /**
     * Stagger reveal list items or cards with a smooth upward fade.
     */
    staggerIn(
        targets: string | Element | Element[] | NodeList,
        stagger = 0.06,
        delay = 0.05
    ): gsap.core.Tween | null {
        if (!this.isBrowser) return null;

        return gsap.from(targets, {
            opacity: 0,
            y: 16,
            duration: 0.45,
            stagger,
            delay,
            ease: 'power2.out',
            clearProps: 'all'
        });
    }

    /**
     * Smooth micro-pop on completion / interaction
     */
    microPop(target: Element): gsap.core.Tween | null {
        if (!this.isBrowser) return null;

        return gsap.fromTo(
            target,
            { scale: 0.94 },
            { scale: 1, duration: 0.35, ease: 'back.out(2)' }
        );
    }

    /**
     * High-end subtle celebration confetti burst for milestone achievements (e.g. 100% mastery or subject completion)
     */
    celebrateSuccess(opts?: { x?: number; y?: number }): void {
        if (!this.isBrowser) return;

        const origin = {
            x: opts?.x ?? 0.5,
            y: opts?.y ?? 0.6
        };

        // Two quick tasteful bursts with tailored brand colors (Cyan, Blue, Indigo, Emerald)
        confetti({
            particleCount: 40,
            spread: 60,
            origin,
            colors: ['#00c8e8', '#1a56db', '#3b82f6', '#10b981', '#f59e0b'],
            disableForReducedMotion: true,
            ticks: 200,
            gravity: 1.2,
            scalar: 0.9
        });

        setTimeout(() => {
            confetti({
                particleCount: 25,
                angle: 60,
                spread: 55,
                origin: { x: origin.x - 0.1, y: origin.y },
                colors: ['#00c8e8', '#38bdf8', '#818cf8', '#34d399'],
                disableForReducedMotion: true,
                ticks: 180,
                gravity: 1.1,
                scalar: 0.8
            });
            confetti({
                particleCount: 25,
                angle: 120,
                spread: 55,
                origin: { x: origin.x + 0.1, y: origin.y },
                colors: ['#1a56db', '#60a5fa', '#a855f7', '#fbbf24'],
                disableForReducedMotion: true,
                ticks: 180,
                gravity: 1.1,
                scalar: 0.8
            });
        }, 120);
    }

    /**
     * Subtle micro-sparkle for single topic completions
     */
    miniSparkle(event?: MouseEvent): void {
        if (!this.isBrowser) return;

        const x = event ? event.clientX / window.innerWidth : 0.5;
        const y = event ? event.clientY / window.innerHeight : 0.5;

        confetti({
            particleCount: 15,
            spread: 40,
            origin: { x, y },
            colors: ['#00c8e8', '#3b82f6', '#10b981'],
            disableForReducedMotion: true,
            ticks: 120,
            gravity: 1.4,
            scalar: 0.65
        });
    }
}
