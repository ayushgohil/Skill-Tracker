// src/app/shared/bottom-nav/bottom-nav.component.ts
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type NavTab = 'home' | 'weekly' | 'profile';

/**
 * The bottom menu used on Dashboard, Subject and Profile pages.
 *
 * Phone: a full-width tab bar with big icons, readable labels and a highlighted
 *        active tab (like a native app). It keeps clear of the phone's home bar.
 * Tablet / desktop (md and up): a centred floating bar.
 *
 * It replaces three copy-pasted small pills, so every page now looks the same.
 */
@Component({
    selector: 'app-bottom-nav',
    standalone: true,
    imports: [RouterLink],
    template: `
    <nav class="app-bottom-nav" aria-label="Main menu">
        @for (tab of tabs; track tab.id) {
        <a [routerLink]="tab.link" class="app-nav-tab touch-manipulation"
           [class.is-active]="active() === tab.id"
           [attr.aria-current]="active() === tab.id ? 'page' : null">
            <span class="app-nav-icon">
                @switch (tab.id) {
                    @case ('home') {
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
                    </svg>
                    }
                    @case ('weekly') {
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    }
                    @case ('profile') {
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                    }
                }
            </span>
            <span class="app-nav-label">{{ tab.label }}</span>
        </a>
        }
    </nav>
    `
})
export class BottomNavComponent {
    /** Which tab is highlighted. */
    active = input.required<NavTab>();

    readonly tabs: { id: NavTab; label: string; link: string }[] = [
        { id: 'home', label: 'Home', link: '/dashboard' },
        { id: 'weekly', label: 'Weekly', link: '/weekly' },
        { id: 'profile', label: 'Profile', link: '/profile' },
    ];
}
