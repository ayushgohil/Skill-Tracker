// src/app/auth/password-strength.ts
// A simple, honest password hint for the sign-up page. It never blocks anyone:
// the server decides what is allowed. It only helps people choose a better password.

export interface PasswordStrength {
    /** 0 = nothing typed, 1 = weak ... 4 = strong */
    level: 0 | 1 | 2 | 3 | 4;
    label: string;
    /** One short, friendly suggestion. Empty when there is nothing to suggest. */
    tip: string;
}

const COMMON = new Set([
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123',
    'qwertyuiop', 'iloveyou', 'admin123', 'welcome1', 'letmein123', 'abc12345', '11111111'
]);

export function checkPasswordStrength(password: string): PasswordStrength {
    if (!password) return { level: 0, label: '', tip: '' };

    if (password.length < 8) {
        return { level: 1, label: 'Too short', tip: 'Use at least 8 characters.' };
    }

    if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
        return { level: 1, label: 'Too common', tip: 'This is easy to guess. Try a few unrelated words.' };
    }

    const mixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const isLong = password.length >= 12;

    // A long passphrase is strong even without symbols, so 16+ characters earn a bonus.
    const points = [mixedCase, hasNumber, hasSymbol, isLong, password.length >= 16].filter(Boolean).length;

    const tip =
        !isLong ? 'Longer is stronger. Try 12 or more characters.' :
        !hasNumber ? 'Add a number.' :
        !mixedCase ? 'Mix capital and small letters.' :
        !hasSymbol ? 'Add a symbol like ! or #.' : '';

    if (points <= 0) return { level: 1, label: 'Weak', tip };
    if (points === 1) return { level: 2, label: 'Fair', tip };
    if (points === 2) return { level: 3, label: 'Good', tip };
    return { level: 4, label: 'Strong', tip };
}
