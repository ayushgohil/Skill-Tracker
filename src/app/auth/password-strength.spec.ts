import { checkPasswordStrength } from './password-strength';

describe('checkPasswordStrength', () => {
    it('says nothing while the box is empty', () => {
        expect(checkPasswordStrength('')).toEqual({ level: 0, label: '', tip: '' });
    });

    it('asks for more characters under 8', () => {
        const r = checkPasswordStrength('Ab1!xyz');
        expect(r.label).toBe('Too short');
        expect(r.level).toBe(1);
        expect(r.tip).toContain('8');
    });

    it('catches very common passwords, in any capitals', () => {
        expect(checkPasswordStrength('Password123').label).toBe('Too common');
        expect(checkPasswordStrength('12345678').label).toBe('Too common');
    });

    it('catches one repeated character', () => {
        expect(checkPasswordStrength('aaaaaaaaaaaa').label).toBe('Too common');
    });

    it('is weak with only small letters at 8 characters, and suggests going longer', () => {
        const r = checkPasswordStrength('tomatoes');
        expect(r.label).toBe('Weak');
        expect(r.level).toBe(1);
        expect(r.tip).toContain('12');
    });

    it('gets better as variety is added', () => {
        expect(checkPasswordStrength('tomatoes7').label).toBe('Fair');
        expect(checkPasswordStrength('Tomatoes7').label).toBe('Good');
        expect(checkPasswordStrength('Tomatoes7!').label).toBe('Strong');
    });

    it('treats a long passphrase as good even without symbols', () => {
        expect(checkPasswordStrength('purple elephants dance quietly').level).toBeGreaterThanOrEqual(3);
    });

    it('has no tip once it is strong', () => {
        const r = checkPasswordStrength('Correct-Horse-Battery-9');
        expect(r.level).toBe(4);
        expect(r.tip).toBe('');
    });

    it('suggests the next useful step', () => {
        expect(checkPasswordStrength('Tomatoes-in-garden').tip).toContain('number');
    });
});
