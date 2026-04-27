// src/app/shared/pomodoro/pomodoro.component.ts
import { Component, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { PomodoroService } from '../../core/services/pomodoro.service';

@Component({
    selector: 'app-pomodoro',
    standalone: true,
    imports: [TitleCasePipe],
    templateUrl: './pomodoro.component.html'
})
export class PomodoroComponent implements OnInit {

    constructor(public pomodoroService: PomodoroService) {}

    ngOnInit() {
        this.pomodoroService.requestNotificationPermission();
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
}
