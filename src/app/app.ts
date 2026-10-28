import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PomodoroComponent } from './shared/pomodoro/pomodoro.component';
import { OfflineBannerComponent } from './shared/offline-banner/offline-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PomodoroComponent, OfflineBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('skilltracker');
}
