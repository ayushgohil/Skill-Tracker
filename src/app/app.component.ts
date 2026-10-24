// src/app/app.component.ts
import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PomodoroComponent } from './shared/pomodoro/pomodoro.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, PomodoroComponent],
    template: `
        <router-outlet />
        <app-pomodoro />
    `
})
export class AppComponent {
    private router = inject(Router);

    constructor() {
        this.router.events.pipe(
            filter((event): event is NavigationEnd => event instanceof NavigationEnd)
        ).subscribe(() => {
            if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            }
        });
    }
}