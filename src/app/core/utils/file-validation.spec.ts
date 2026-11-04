import { escapeHtml, previewKind, validateFile } from './file-validation';

const file = (name: string, type: string, size = 100) =>
    new File([new Uint8Array(size)], name, { type });

describe('file validation', () => {
    it('no longer accepts SVG uploads (they can carry scripts)', () => {
        expect(validateFile(file('logo.svg', 'image/svg+xml')).valid).toBe(false);
    });

    it('still accepts PDFs, images, text, Word and zip files', () => {
        for (const [n, t] of [['a.pdf', 'application/pdf'], ['a.png', 'image/png'], ['a.txt', 'text/plain'],
            ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['a.zip', 'application/zip']]) {
            expect(validateFile(file(n, t)).valid).toBe(true);
        }
    });

    it('escapes file names so a name cannot inject HTML into the popup', () => {
        const res = validateFile(file('<img src=x onerror=alert(1)>.exe', 'application/x-msdownload'));
        expect(res.valid).toBe(false);
        expect(res.error).not.toContain('<img');
        expect(res.error).toContain('&lt;img');
    });

    it('escapeHtml handles all five special characters', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });
});

describe('previewKind', () => {
    it('shows images, videos, PDFs and plain text', () => {
        expect(previewKind('image/png')).toBe('image');
        expect(previewKind('image/svg+xml')).toBe('image'); // old SVGs are drawn as pictures, which cannot run scripts
        expect(previewKind('video/mp4')).toBe('video');
        expect(previewKind('application/pdf')).toBe('pdf');
        expect(previewKind('text/plain')).toBe('text');
        expect(previewKind('text/csv')).toBe('text');
        expect(previewKind('text/markdown')).toBe('text');
    });

    it('gives no preview for everything else, including pages and scripts', () => {
        for (const m of ['text/html', 'application/xhtml+xml', 'application/javascript', 'application/msword',
            'application/zip', 'audio/mpeg', '', null, undefined]) {
            expect(previewKind(m as any)).toBe('none');
        }
    });
});
