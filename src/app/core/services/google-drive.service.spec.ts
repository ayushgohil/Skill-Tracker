import { TestBed } from '@angular/core/testing';
import { GoogleDriveService } from './google-drive.service';

const FOLDER = 'application/vnd.google-apps.folder';

/** A pretend Google Drive: folders and files, listed by parent. */
function installFakeDrive(items: { id: string; name: string; mimeType: string; parent: string }[], opts: { patchStatus?: number } = {}) {
    const calls: { url: string; method: string; body?: any }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
        if (method === 'PATCH') {
            return { ok: (opts.patchStatus ?? 200) < 300, status: opts.patchStatus ?? 200, json: async () => ({}) };
        }
        const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
        const parentMatch = q.match(/'([^']+)' in parents/);
        const nameMatch = q.match(/^name='([^']+)'/);
        let files = items;
        if (parentMatch) files = items.filter(i => i.parent === parentMatch[1]);
        else if (nameMatch) files = items.filter(i => i.name === nameMatch[1] && i.mimeType === FOLDER);
        return { ok: true, status: 200, json: async () => ({ files }) };
    }));
    return calls;
}

describe('GoogleDriveService: account deletion helpers', () => {
    let drive: GoogleDriveService;

    beforeEach(() => {
        drive = TestBed.inject(GoogleDriveService);
        vi.spyOn(drive, 'getAccessToken').mockResolvedValue('token');
    });
    afterEach(() => vi.unstubAllGlobals());

    it('says "not found" when the app folder does not exist and creates nothing', async () => {
        const calls = installFakeDrive([]);
        const res = await drive.getAppFolderSummary();
        expect(res.found).toBe(false);
        expect(calls.every(c => c.method === 'GET')).toBe(true);
    });

    it('counts backups and attachments, including files in sub folders', async () => {
        installFakeDrive([
            { id: 'root', name: 'NextLyr SkillTracker', mimeType: FOLDER, parent: 'drive' },
            { id: 'bk', name: 'Backups', mimeType: FOLDER, parent: 'root' },
            { id: 'b1', name: 'b1.json', mimeType: 'application/json', parent: 'bk' },
            { id: 'b2', name: 'b2.json', mimeType: 'application/json', parent: 'bk' },
            { id: 's1', name: 'Angular', mimeType: FOLDER, parent: 'root' },
            { id: 'm1', name: 'media', mimeType: FOLDER, parent: 's1' },
            { id: 'f1', name: 'a.pdf', mimeType: 'application/pdf', parent: 'm1' },
            { id: 'f2', name: 'b.png', mimeType: 'image/png', parent: 'm1' },
            { id: 'f3', name: 'c.png', mimeType: 'image/png', parent: 's1' },
        ]);
        const res = await drive.getAppFolderSummary();
        expect(res).toMatchObject({ found: true, folderId: 'root', files: 5, backups: 2, attachments: 3, truncated: false });
    });

    it('reports an empty folder as 0 files', async () => {
        installFakeDrive([{ id: 'root', name: 'NextLyr SkillTracker', mimeType: FOLDER, parent: 'drive' }]);
        expect(await drive.getAppFolderSummary()).toMatchObject({ found: true, files: 0 });
    });

    it('moves the folder to the Trash (not a permanent delete)', async () => {
        const calls = installFakeDrive([{ id: 'root', name: 'NextLyr SkillTracker', mimeType: FOLDER, parent: 'drive' }]);
        await drive.trashAppFolder();
        const patch = calls.find(c => c.method === 'PATCH')!;
        expect(patch.url).toContain('/files/root');
        expect(patch.body).toEqual({ trashed: true });
        expect(calls.some(c => c.method === 'DELETE')).toBe(false);
    });

    it('does nothing when there is no folder', async () => {
        const calls = installFakeDrive([]);
        await drive.trashAppFolder();
        expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    });

    it('throws when Google refuses, so the account is not deleted', async () => {
        installFakeDrive([{ id: 'root', name: 'NextLyr SkillTracker', mimeType: FOLDER, parent: 'drive' }], { patchStatus: 403 });
        await expect(drive.trashAppFolder()).rejects.toThrow(/Trash/);
    });

    it('throws when there is no Drive access', async () => {
        (drive.getAccessToken as any).mockResolvedValue(null);
        await expect(drive.trashAppFolder()).rejects.toThrow('NO_DRIVE_ACCESS');
        await expect(drive.getAppFolderSummary()).rejects.toThrow('NO_DRIVE_ACCESS');
    });
});
