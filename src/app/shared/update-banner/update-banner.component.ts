// src/app/shared/update-banner/update-banner.component.ts
import { Component, inject } from '@angular/core';
import { PwaService } from '../../core/services/pwa.service';

/**
 * "A new version is ready" notice. Without it, an installed app can keep showing an
 * old version until the user happens to close it completely.
 */
@Component({
    selector: 'app-update-banner',
    standalone: true,
    template: `
    @if (pwa.updateReady() || pwa.needsReload()) {
      <div class="update-banner fixed bottom-24 md:bottom-24 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex items-center gap-3 pl-4 pr-2 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-xl bg-blue-600 text-white border border-blue-400"
           role="status" aria-live="polite">
        <span>{{ pwa.needsReload() ? 'Something went wrong. Please reload.' : 'A new version is ready.' }}</span>
        <button type="button" (click)="pwa.applyUpdate()"
                class="px-3 py-1.5 rounded-full bg-white text-blue-700 font-bold min-h-[32px] touch-manipulation">
          {{ pwa.needsReload() ? 'Reload' : 'Refresh' }}
        </button>
      </div>
    }
  `
})
export class UpdateBannerComponent {
    pwa = inject(PwaService);
}
