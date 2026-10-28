import { TestBed } from '@angular/core/testing';
import { NetworkStatusService } from './network-status.service';

describe('NetworkStatusService', () => {
    let service: NetworkStatusService;

    beforeEach(() => {
        vi.useFakeTimers();
        TestBed.configureTestingModule({});
        service = TestBed.inject(NetworkStatusService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts online', () => {
        expect(service.online()).toBe(true);
        expect(service.justReconnected()).toBe(false);
    });

    it('goes offline when the browser says so', () => {
        window.dispatchEvent(new Event('offline'));
        expect(service.online()).toBe(false);
        expect(service.justReconnected()).toBe(false);
    });

    it('shows "back online" for three seconds after reconnecting', () => {
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));

        expect(service.online()).toBe(true);
        expect(service.justReconnected()).toBe(true);

        vi.advanceTimersByTime(2999);
        expect(service.justReconnected()).toBe(true);
        vi.advanceTimersByTime(1);
        expect(service.justReconnected()).toBe(false);
    });

    it('does not show "back online" if it was never offline', () => {
        window.dispatchEvent(new Event('online'));
        expect(service.justReconnected()).toBe(false);
    });

    it('drops the "back online" notice if the connection is lost again', () => {
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new Event('offline'));

        expect(service.online()).toBe(false);
        expect(service.justReconnected()).toBe(false);

        vi.advanceTimersByTime(10_000);
        expect(service.justReconnected()).toBe(false);
    });

    it('words a failure differently when offline', () => {
        expect(service.describeFailure('save your progress')).toBe("Couldn't save your progress.");

        window.dispatchEvent(new Event('offline'));
        expect(service.describeFailure('save your progress'))
            .toBe("You're offline, so we couldn't save your progress.");
    });
});
