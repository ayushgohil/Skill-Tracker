// src/app/core/services/theme.service.ts
import { Injectable, signal, computed, effect, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'skilltracker-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    /** Current theme signal */
    theme = signal<Theme>('light');

    /** Convenience computed */
    isDark = computed(() => this.theme() === 'dark');

    private isBrowser: boolean;

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);

        if (this.isBrowser) {
            // 1. Read stored preference → default to 'light'
            const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
            const initial: Theme = stored ?? 'light';
            this.theme.set(initial);
            this.applyTheme(initial);

            // 2. Listen for OS-level theme changes (only if no stored preference)
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            mq.addEventListener('change', (e) => {
                if (!localStorage.getItem(STORAGE_KEY)) {
                    const osTheme: Theme = e.matches ? 'dark' : 'light';
                    this.theme.set(osTheme);
                    this.applyTheme(osTheme);
                }
            });
        }
    }

    /** Toggle between light and dark */
    toggle(): void {
        const next: Theme = this.isDark() ? 'light' : 'dark';
        this.theme.set(next);
        if (this.isBrowser) {
            localStorage.setItem(STORAGE_KEY, next);
            this.applyTheme(next);
        }
    }

    /** Set a specific theme */
    setTheme(theme: Theme): void {
        this.theme.set(theme);
        if (this.isBrowser) {
            localStorage.setItem(STORAGE_KEY, theme);
            this.applyTheme(theme);
        }
    }

    /** Apply the theme class to <html> */
    private applyTheme(theme: Theme): void {
        const html = document.documentElement;
        if (theme === 'dark') {
            html.classList.add('dark');
        } else {
            html.classList.remove('dark');
        }
    }
}
