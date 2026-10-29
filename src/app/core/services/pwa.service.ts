// src/app/core/services/pwa.service.ts
// Everything about the app working as an installed app (a PWA):
//  - tells the user when a new version has been downloaded, so they can refresh
//  - lets them install the app (Android/desktop prompt, or a hint on iPhone)
// The service worker itself only runs in the production build on the real website.
import { Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** How often an open app asks the server whether a new version exists. */
const CHECK_EVERY_MS = 60 * 60 * 1000;
/** After coming back to the app, do not check again within this time. */
const MIN_GAP_MS = 10 * 60 * 1000;

/** The browser's install prompt (not in the standard TypeScript types). */
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
    private swUpdate = inject(SwUpdate, { optional: true });

    /** A new version is downloaded and waiting. A refresh switches to it. */
    updateReady = signal(false);
    /** The app got into a broken state and needs a reload. */
    needsReload = signal(false);

    private installEvent = signal<BeforeInstallPromptEvent | null>(null);
    isInstalled = signal(false);
    private isIos = signal(false);

    /** Android / desktop Chrome and Edge: the browser can show its own install dialog. */
    canPromptInstall = computed(() => !!this.installEvent() && !this.isInstalled());
    /** iPhone / iPad: there is no dialog, so we explain "Share, then Add to Home Screen". */
    showIosHint = computed(() => this.isIos() && !this.isInstalled());
    /** Show an "Install app" row at all? */
    installable = computed(() => this.canPromptInstall() || this.showIosHint());

    private lastCheck = Date.now();

    constructor() {
        if (typeof window === 'undefined') return;

        this.isInstalled.set(this.detectStandalone());
        this.isIos.set(this.detectIos());

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault(); // keep it for our own button
            this.installEvent.set(event as BeforeInstallPromptEvent);
        });
        window.addEventListener('appinstalled', () => {
            this.installEvent.set(null);
            this.isInstalled.set(true);
        });

        this.watchForUpdates();
    }

    /** Opens the browser's install dialog. Returns true if the user accepted. */
    async install(): Promise<boolean> {
        const event = this.installEvent();
        if (!event) return false;
        await event.prompt();
        const choice = await event.userChoice;
        this.installEvent.set(null); // a prompt can only be used once
        if (choice.outcome === 'accepted') this.isInstalled.set(true);
        return choice.outcome === 'accepted';
    }

    /** Switches to the new version by reloading the page. */
    async applyUpdate(): Promise<void> {
        try {
            await this.swUpdate?.activateUpdate();
        } catch {
            // Reloading still picks up the newest files from the network.
        }
        this.reloadPage();
    }

    /** Separate so tests can replace it (a real reload would end the test). */
    reloadPage(): void {
        window.location.reload();
    }

    private watchForUpdates() {
        const sw = this.swUpdate;
        if (!sw || !sw.isEnabled) return; // development, or a browser without service workers

        sw.versionUpdates
            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
            .subscribe(() => this.updateReady.set(true));

        sw.unrecoverable.subscribe(() => this.needsReload.set(true));

        const check = () => {
            this.lastCheck = Date.now();
            sw.checkForUpdate().catch(() => { /* offline: try again later */ });
        };

        setInterval(check, CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && Date.now() - this.lastCheck > MIN_GAP_MS) check();
        });
    }

    private detectStandalone(): boolean {
        const mq = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
        return mq || (navigator as any).standalone === true;
    }

    private detectIos(): boolean {
        const ua = navigator.userAgent || '';
        const iPhoneOrPod = /iPhone|iPod/.test(ua);
        // Recent iPads say they are a Mac, but a Mac has no touch screen
        const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        return iPhoneOrPod || iPad;
    }
}
