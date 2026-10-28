// src/app/shared/offline-banner/offline-banner.component.ts
import { Component, inject } from '@angular/core';
import { NetworkStatusService } from '../../core/services/network-status.service';

/** Small notice at the top of the screen while the browser is offline. */
@Component({
    selector: 'app-offline-banner',
    standalone: true,
    template: `
    @if (!network.online()) {
      <div class="offline-banner fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-xl bg-amber-500 text-zinc-950 border border-amber-400"
           role="status" aria-live="polite">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M3 3l18 18"/>
        </svg>
        <span>You're offline. Changes can't be saved until you reconnect.</span>
      </div>
    } @else if (network.justReconnected()) {
      <div class="offline-banner fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-xl bg-emerald-500 text-zinc-950 border border-emerald-400"
           role="status" aria-live="polite">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <span>Back online</span>
      </div>
    }
  `
})
export class OfflineBannerComponent {
    network = inject(NetworkStatusService);
}
