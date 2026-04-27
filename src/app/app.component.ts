// src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
export class AppComponent { }