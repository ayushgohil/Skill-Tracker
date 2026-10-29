import { TestBed } from '@angular/core/testing';
import { UpdateBannerComponent } from './update-banner.component';
import { PwaService } from '../../core/services/pwa.service';

describe('UpdateBannerComponent', () => {
    const render = async (setup: (pwa: PwaService) => void) => {
        await TestBed.configureTestingModule({ imports: [UpdateBannerComponent] }).compileComponents();
        const pwa = TestBed.inject(PwaService);
        setup(pwa);
        const fixture = TestBed.createComponent(UpdateBannerComponent);
        await fixture.whenStable();
        fixture.detectChanges();
        return { el: fixture.nativeElement as HTMLElement, pwa };
    };

    it('shows nothing normally', async () => {
        const { el } = await render(() => { });
        expect(el.querySelector('.update-banner')).toBeNull();
    });

    it('offers a refresh when a new version is ready, and the button applies it', async () => {
        const { el, pwa } = await render(p => p.updateReady.set(true));
        const banner = el.querySelector('.update-banner');
        expect(banner?.textContent).toContain('A new version is ready');
        expect(banner?.getAttribute('role')).toBe('status');

        const apply = vi.spyOn(pwa, 'applyUpdate').mockResolvedValue();
        el.querySelector<HTMLButtonElement>('.update-banner button')!.click();
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it('asks for a reload when something broke', async () => {
        const { el } = await render(p => p.needsReload.set(true));
        expect(el.querySelector('.update-banner')?.textContent).toContain('Please reload');
        expect(el.querySelector('.update-banner button')?.textContent).toContain('Reload');
    });
});
