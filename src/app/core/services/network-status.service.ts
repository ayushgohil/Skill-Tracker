// src/app/core/services/network-status.service.ts
import { Injectable, signal } from '@angular/core';

/**
 * Tracks whether the browser thinks it is online.
 *
 * The browser's "online" flag is only a hint (it can say "online" while the internet is
 * actually down), so the app never relies on it alone: a failed save is always treated as
 * a failure and offered a Retry. This service is only used to word messages helpfully and
 * to show the "You're offline" banner.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
    private static readonly RECONNECTED_NOTICE_MS = 3000;

    online = signal(true);
    /** True for a few seconds after the connection comes back, to show "Back online". */
    justReconnected = signal(false);

    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        if (typeof window === 'undefined') return;

        this.online.set(typeof navigator === 'undefined' ? true : navigator.onLine);
        window.addEventListener('offline', () => this.setOnline(false));
        window.addEventListener('online', () => this.setOnline(true));
    }

    /** Wording for "that did not save", aware of whether the browser is offline. */
    describeFailure(action: string): string {
        return this.online()
            ? `Couldn't ${action}.`
            : `You're offline, so we couldn't ${action}.`;
    }

    private setOnline(value: boolean) {
        const wasOnline = this.online();
        this.online.set(value);

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (value && !wasOnline) {
            this.justReconnected.set(true);
            this.reconnectTimer = setTimeout(() => {
                this.justReconnected.set(false);
                this.reconnectTimer = null;
            }, NetworkStatusService.RECONNECTED_NOTICE_MS);
        } else {
            this.justReconnected.set(false);
        }
    }
}
