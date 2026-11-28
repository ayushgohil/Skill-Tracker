import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
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
  private router = inject(Router, { optional: true });
  private platformId = inject(PLATFORM_ID);
  private lastPath: string | null = null;

  constructor() {
    this.router?.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const nextPath = event.urlAfterRedirects.split('?')[0].split('#')[0];
      if (this.lastPath !== null && this.lastPath !== nextPath && isPlatformBrowser(this.platformId)) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      this.lastPath = nextPath;
    });
  }
}
