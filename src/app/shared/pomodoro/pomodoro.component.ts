import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PomodoroService } from '../../core/services/pomodoro.service';
import { fadeSlideInOut } from '../../core/animations/app.animations';

@Component({
    selector: 'app-pomodoro',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './pomodoro.component.html',
    animations: [fadeSlideInOut]
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
