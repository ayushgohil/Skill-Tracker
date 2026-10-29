import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent', () => {
    async function render(active: 'home' | 'weekly' | 'profile') {
        await TestBed.configureTestingModule({
            imports: [BottomNavComponent],
            providers: [provideRouter([])]
        }).compileComponents();
        const fixture = TestBed.createComponent(BottomNavComponent);
        fixture.componentRef.setInput('active', active);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('shows Home, Weekly and Profile pointing at the right pages', async () => {
        const el = await render('home');
        const links = Array.from(el.querySelectorAll('a'));
        expect(links.map(a => a.textContent?.trim())).toEqual(['Home', 'Weekly', 'Profile']);
        expect(links.map(a => a.getAttribute('href'))).toEqual(['/dashboard', '/weekly', '/profile']);
    });

    it('marks only the current tab as active', async () => {
        const el = await render('profile');
        const active = Array.from(el.querySelectorAll('a.is-active'));
        expect(active.length).toBe(1);
        expect(active[0].textContent?.trim()).toBe('Profile');
        expect(active[0].getAttribute('aria-current')).toBe('page');
    });
});
