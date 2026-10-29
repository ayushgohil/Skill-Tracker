import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PomodoroComponent } from './shared/pomodoro/pomodoro.component';
import { OfflineBannerComponent } from './shared/offline-banner/offline-banner.component';
import { UpdateBannerComponent } from './shared/update-banner/update-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PomodoroComponent, OfflineBannerComponent, UpdateBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('skilltracker');
}
