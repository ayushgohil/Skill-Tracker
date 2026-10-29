import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaService } from './pwa.service';

/** A stand-in for Angular's SwUpdate that the test can push events into. */
function fakeSwUpdate(isEnabled = true) {
    return {
        isEnabled,
        versionUpdates: new Subject<any>(),
        unrecoverable: new Subject<any>(),
        checkForUpdate: vi.fn().mockResolvedValue(true),
        activateUpdate: vi.fn().mockResolvedValue(true)
    };
}

describe('PwaService', () => {
    let sw: ReturnType<typeof fakeSwUpdate>;

    const create = (swEnabled = true, withSw = true) => {
        sw = fakeSwUpdate(swEnabled);
        TestBed.configureTestingModule({
            providers: [PwaService, ...(withSw ? [{ provide: SwUpdate, useValue: sw }] : [])]
        });
        return TestBed.inject(PwaService);
    };

    const installEvent = (outcome: 'accepted' | 'dismissed') => {
        const e: any = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = vi.fn().mockResolvedValue(undefined);
        e.userChoice = Promise.resolve({ outcome });
        return e;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('updates', () => {
        it('starts with nothing to show', () => {
            const pwa = create();
            expect(pwa.updateReady()).toBe(false);
            expect(pwa.needsReload()).toBe(false);
        });

        it('says an update is ready when a new version has been downloaded', () => {
            const pwa = create();
            sw.versionUpdates.next({ type: 'VERSION_DETECTED' });
            expect(pwa.updateReady()).toBe(false); // still downloading
            sw.versionUpdates.next({ type: 'VERSION_READY' });
            expect(pwa.updateReady()).toBe(true);
        });

        it('asks for a reload when the service worker breaks', () => {
            const pwa = create();
            sw.unrecoverable.next({ reason: 'broken' });
            expect(pwa.needsReload()).toBe(true);
        });

        it('switches to the new version and reloads when asked', async () => {
            const pwa = create();
            const reload = vi.spyOn(pwa, 'reloadPage').mockImplementation(() => { });
            await pwa.applyUpdate();
            expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
            expect(reload).toHaveBeenCalledTimes(1);
        });

        it('still reloads if activating the update fails', async () => {
            const pwa = create();
            sw.activateUpdate.mockRejectedValueOnce(new Error('nope'));
            const reload = vi.spyOn(pwa, 'reloadPage').mockImplementation(() => { });
            await pwa.applyUpdate();
            expect(reload).toHaveBeenCalledTimes(1);
        });

        it('checks for a new version every hour', async () => {
            create();
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 10);
            expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
        });

        it('checks when you come back to the app, but not again within 10 minutes', async () => {
            create();
            await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
            document.dispatchEvent(new Event('visibilitychange'));
            expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(60 * 1000);
            document.dispatchEvent(new Event('visibilitychange'));
            expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
        });

        it('does nothing when the service worker is off (development)', async () => {
            const pwa = create(false);
            sw.versionUpdates.next({ type: 'VERSION_READY' });
            await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
            expect(pwa.updateReady()).toBe(false);
            expect(sw.checkForUpdate).not.toHaveBeenCalled();
        });

        it('works when there is no service worker support at all', () => {
            const pwa = create(true, false);
            expect(pwa.updateReady()).toBe(false);
        });
    });

    describe('installing', () => {
        it('is not installable until the browser says it can be', () => {
            const pwa = create();
            expect(pwa.installable()).toBe(false);
            window.dispatchEvent(installEvent('accepted'));
            expect(pwa.canPromptInstall()).toBe(true);
            expect(pwa.installable()).toBe(true);
        });

        it('keeps the browser prompt for our own button', () => {
            create();
            const e = installEvent('accepted');
            window.dispatchEvent(e);
            expect(e.defaultPrevented).toBe(true);
        });

        it('shows the browser dialog and reports what the user chose', async () => {
            const pwa = create();
            const e = installEvent('accepted');
            window.dispatchEvent(e);
            expect(await pwa.install()).toBe(true);
            expect(e.prompt).toHaveBeenCalledTimes(1);
            expect(pwa.isInstalled()).toBe(true);
            expect(pwa.installable()).toBe(false);
        });

        it('stays installable-looking but used up when the user says no (a prompt works once)', async () => {
            const pwa = create();
            window.dispatchEvent(installEvent('dismissed'));
            expect(await pwa.install()).toBe(false);
            expect(pwa.isInstalled()).toBe(false);
            expect(pwa.canPromptInstall()).toBe(false);
            expect(await pwa.install()).toBe(false);
        });

        it('hides the install row once the app has been installed', () => {
            const pwa = create();
            window.dispatchEvent(installEvent('accepted'));
            window.dispatchEvent(new Event('appinstalled'));
            expect(pwa.isInstalled()).toBe(true);
            expect(pwa.installable()).toBe(false);
        });

        it('knows when it is already running as an installed app', () => {
            vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone'), media: q }));
            const pwa = create();
            window.dispatchEvent(installEvent('accepted'));
            expect(pwa.isInstalled()).toBe(true);
            expect(pwa.installable()).toBe(false);
        });
    });

    describe('iPhone', () => {
        const withUserAgent = (ua: string, touchPoints = 0) => {
            vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: touchPoints });
        };

        it('shows the "Add to Home Screen" hint in Safari on an iPhone', () => {
            withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 5);
            const pwa = create();
            expect(pwa.showIosHint()).toBe(true);
            expect(pwa.canPromptInstall()).toBe(false);
            expect(pwa.installable()).toBe(true);
        });

        it('treats a touch-screen "Mac" as an iPad', () => {
            withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5);
            expect(create().showIosHint()).toBe(true);
        });

        it('does not show the hint on a real Mac or Android phone', () => {
            withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0);
            expect(create().showIosHint()).toBe(false);
        });
    });
});
