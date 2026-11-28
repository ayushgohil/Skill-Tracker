import { ApplicationConfig, inject, isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { Router, TitleStrategy, provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideQuillConfig } from 'ngx-quill/config';
import { routes } from './app.routes';
import { AppTitleStrategy } from './core/services/title.strategy';

/** People who ask their device for "reduced motion" get no Angular animations. */
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      // Page-to-page scroll-to-top is handled in App only when the route path changes,
      // so expanding topics (?topic=...) or opening media (?media=...) never jumps to top.
      withInMemoryScrolling({ scrollPositionRestoration: 'disabled', anchorScrolling: 'enabled' }),
      // Soft fade between pages (skipped when only query params/fragment change on the same page).
      withViewTransitions({
        onViewTransitionCreated: ({ transition }) => {
          const router = inject(Router);
          const targetUrl = router.currentNavigation()?.finalUrl;
          if (!targetUrl) return;
          const currentPath = router.url.split('?')[0].split('#')[0];
          const targetPath = router.serializeUrl(targetUrl).split('?')[0].split('#')[0];
          if (currentPath === targetPath) {
            transition.skipTransition();
          }
        }
      })
    ),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideAnimationsAsync(prefersReducedMotion ? 'noop' : 'animations'),
    // Makes the app installable and quick to open. Only active in the production build
    // (the service worker file is created by `ng build`). It never stores database or
    // login requests, only the app's own files.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideQuillConfig({
      modules: {
        magicUrl: true,
        syntax: true,
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['code-block'],
          [{ 'color': [] }, { 'background': [] }],
          ['clean'],
          ['link']
        ]
      }
    })
  ]
};