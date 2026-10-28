import { TestBed } from '@angular/core/testing';
import { OfflineBannerComponent } from './offline-banner.component';
import { NetworkStatusService } from '../../core/services/network-status.service';

describe('OfflineBannerComponent', () => {
    const render = async (setup: (network: NetworkStatusService) => void) => {
        await TestBed.configureTestingModule({ imports: [OfflineBannerComponent] }).compileComponents();
        const network = TestBed.inject(NetworkStatusService);
        setup(network);
        const fixture = TestBed.createComponent(OfflineBannerComponent);
        await fixture.whenStable();
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    };

    it('shows nothing while online', async () => {
        const el = await render(() => { });
        expect(el.querySelector('.offline-banner')).toBeNull();
    });

    it('warns that changes cannot be saved while offline', async () => {
        const el = await render(n => n.online.set(false));
        const banner = el.querySelector('.offline-banner');
        expect(banner).not.toBeNull();
        expect(banner!.textContent).toContain("You're offline");
        expect(banner!.getAttribute('role')).toBe('status');
    });

    it('says "Back online" right after reconnecting', async () => {
        const el = await render(n => n.justReconnected.set(true));
        const banner = el.querySelector('.offline-banner');
        expect(banner).not.toBeNull();
        expect(banner!.textContent).toContain('Back online');
    });
});
