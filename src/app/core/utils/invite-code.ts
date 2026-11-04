// src/app/core/utils/invite-code.ts

/** Letters and digits only, same look as before: ST-8A2F9K */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

/**
 * Makes a study-partner invite code such as "ST-8A2F9K".
 * Uses the browser's secure random generator (crypto), not Math.random, so codes
 * cannot be predicted. Bytes that would favour some letters are thrown away so
 * every letter and digit is equally likely.
 */
export function generateInviteCode(): string {
    const limit = 256 - (256 % ALPHABET.length); // 252: values below this map evenly
    let out = '';
    while (out.length < CODE_LENGTH) {
        const bytes = new Uint8Array(CODE_LENGTH * 2);
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b < limit && out.length < CODE_LENGTH) out += ALPHABET[b % ALPHABET.length];
        }
    }
    return `ST-${out}`;
}
