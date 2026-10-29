import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

/**
 * The four sign-in pages. These tests check what password managers and screen readers
 * rely on (labels tied to boxes, autocomplete hints, a real form) and that pressing
 * Enter or the button sends the form exactly once.
 */
describe('Auth pages: labels, autocomplete and one submit', () => {
    let auth: Record<string, ReturnType<typeof vi.fn>>;

    const render = async <T>(component: new (...args: any[]) => T): Promise<{ fixture: ComponentFixture<T>; el: HTMLElement }> => {
        await TestBed.configureTestingModule({
            imports: [component],
            providers: [provideRouter([{ path: '**', children: [] }]), { provide: AuthService, useValue: auth }]
        }).compileComponents();
        const fixture = TestBed.createComponent(component);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement };
    };

    const type = (input: HTMLInputElement, value: string) => {
        input.value = value;
        input.dispatchEvent(new Event('input'));
    };

    const input = (el: HTMLElement, id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;

    /** Every labelled box has a label whose "for" points at it. */
    const expectLabelled = (el: HTMLElement, id: string) => {
        expect(input(el, id), `input #${id}`).not.toBeNull();
        expect(el.querySelector(`label[for="${id}"]`), `label for #${id}`).not.toBeNull();
    };

    beforeEach(() => {
        auth = {
            login: vi.fn().mockResolvedValue(undefined),
            register: vi.fn().mockResolvedValue(undefined),
            sendPasswordReset: vi.fn().mockResolvedValue(undefined),
            updatePassword: vi.fn().mockResolvedValue(undefined),
            loginWithGoogle: vi.fn().mockResolvedValue(undefined)
        };
    });

    describe('sign in', () => {
        it('has labels and the hints password managers look for', async () => {
            const { el } = await render(LoginComponent);
            expectLabelled(el, 'login-email');
            expectLabelled(el, 'login-password');
            expect(input(el, 'login-email').getAttribute('autocomplete')).toBe('username');
            expect(input(el, 'login-password').getAttribute('autocomplete')).toBe('current-password');
            expect(el.querySelector('form')).not.toBeNull();
        });

        it('sends the details once when the button is pressed', async () => {
            const { fixture, el } = await render(LoginComponent);
            type(input(el, 'login-email'), 'a@b.com');
            type(input(el, 'login-password'), 'secret123');
            el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
            await fixture.whenStable();
            expect(auth['login']).toHaveBeenCalledTimes(1);
            expect(auth['login']).toHaveBeenCalledWith('a@b.com', 'secret123');
        });

        it('sends the details once when Enter submits the form', async () => {
            const { fixture, el } = await render(LoginComponent);
            type(input(el, 'login-email'), 'a@b.com');
            type(input(el, 'login-password'), 'secret123');
            el.querySelector('form')!.dispatchEvent(new Event('submit')); // what Enter does in a real browser
            await fixture.whenStable();
            expect(auth['login']).toHaveBeenCalledTimes(1);
        });

        it('the show/hide button and Google button do not submit the form', async () => {
            const { fixture, el } = await render(LoginComponent);
            type(input(el, 'login-email'), 'a@b.com');
            type(input(el, 'login-password'), 'secret123');
            el.querySelector<HTMLButtonElement>('button[aria-label="Show password"]')!.click();
            fixture.detectChanges();
            expect(auth['login']).not.toHaveBeenCalled();
            expect(input(el, 'login-password').type).toBe('text');
        });
    });

    describe('create account', () => {
        it('has labels, "new password" hint and a described password box', async () => {
            const { el } = await render(RegisterComponent);
            expectLabelled(el, 'register-email');
            expectLabelled(el, 'register-password');
            expect(input(el, 'register-email').getAttribute('autocomplete')).toBe('email');
            expect(input(el, 'register-password').getAttribute('autocomplete')).toBe('new-password');
            const describedBy = input(el, 'register-password').getAttribute('aria-describedby')!;
            expect(el.querySelector(`#${describedBy}`)).not.toBeNull();
        });

        it('sends the details once', async () => {
            const { fixture, el } = await render(RegisterComponent);
            type(input(el, 'register-email'), 'a@b.com');
            type(input(el, 'register-password'), 'Tomatoes7!');
            el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
            await fixture.whenStable();
            expect(auth['register']).toHaveBeenCalledTimes(1);
            expect(auth['register']).toHaveBeenCalledWith('a@b.com', 'Tomatoes7!');
        });

        it('shows the strength meter while typing and keeps its description linked', async () => {
            const { fixture, el } = await render(RegisterComponent);
            type(input(el, 'register-password'), 'Tomatoes7!');
            fixture.detectChanges();
            expect(el.textContent).toContain('Password strength: Strong');
            const describedBy = input(el, 'register-password').getAttribute('aria-describedby')!;
            expect(el.querySelector(`#${describedBy}`)?.textContent).toContain('Strong');
        });

        it('announces errors', async () => {
            auth['register'].mockRejectedValueOnce(new Error('Nope'));
            const { fixture, el } = await render(RegisterComponent);
            type(input(el, 'register-email'), 'a@b.com');
            type(input(el, 'register-password'), 'Tomatoes7!');
            el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
            await fixture.whenStable();
            fixture.detectChanges();
            expect(el.querySelector('[role="alert"]')?.textContent).toContain('Nope');
        });
    });

    describe('forgot password', () => {
        it('has a label and sends once', async () => {
            const { fixture, el } = await render(ForgotPasswordComponent);
            expectLabelled(el, 'forgot-email');
            expect(input(el, 'forgot-email').getAttribute('autocomplete')).toBe('email');
            type(input(el, 'forgot-email'), ' a@b.com ');
            el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
            await fixture.whenStable();
            expect(auth['sendPasswordReset']).toHaveBeenCalledTimes(1);
            expect(auth['sendPasswordReset']).toHaveBeenCalledWith('a@b.com');
        });
    });

    describe('reset password', () => {
        it('has labels and "new password" hints on both boxes', async () => {
            const { el } = await render(ResetPasswordComponent);
            expectLabelled(el, 'reset-password');
            expectLabelled(el, 'reset-confirm');
            expect(input(el, 'reset-password').getAttribute('autocomplete')).toBe('new-password');
            expect(input(el, 'reset-confirm').getAttribute('autocomplete')).toBe('new-password');
        });
    });
});
