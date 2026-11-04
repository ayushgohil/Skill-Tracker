import { generateInviteCode } from './invite-code';

describe('generateInviteCode', () => {
    it('keeps the old look: ST- followed by 6 capital letters or digits', () => {
        for (let i = 0; i < 200; i++) {
            expect(generateInviteCode()).toMatch(/^ST-[A-Z0-9]{6}$/);
        }
    });

    it('does not repeat itself', () => {
        const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
        expect(codes.size).toBe(500);
    });

    it('uses the secure random generator and never Math.random', () => {
        const secure = vi.spyOn(crypto, 'getRandomValues');
        const plain = vi.spyOn(Math, 'random');
        generateInviteCode();
        expect(secure).toHaveBeenCalled();
        expect(plain).not.toHaveBeenCalled();
        secure.mockRestore();
        plain.mockRestore();
    });

    it('treats every letter and digit fairly (bytes 252-255 are skipped)', () => {
        // 252 would map to "A" again if it were not skipped
        const fake = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((arr: Uint8Array) => {
            arr.set([252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7]);
            return arr;
        }) as any);
        expect(generateInviteCode()).toBe('ST-ABCDEF');
        fake.mockRestore();
    });
});
