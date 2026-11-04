import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { ProfileService } from '../core/services/profile.service';
import { GoogleDriveService } from '../core/services/google-drive.service';
import { AuthService } from '../core/services/auth.service';

describe('Delete account with the Google Drive checkbox', () => {
    afterEach(() => vi.unstubAllGlobals());
    let cmp: ProfileComponent;
    let drive: GoogleDriveService;
    let profileService: ProfileService;
    let order: string[];

    async function setup(summary: any) {
        // the test browser has no matchMedia, which the theme service asks for
        vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
        TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [provideRouter([])] });
        drive = TestBed.inject(GoogleDriveService);
        profileService = TestBed.inject(ProfileService);
        const auth = TestBed.inject(AuthService);
        vi.spyOn(auth, 'currentUser').mockReturnValue({ id: 'u1', email: 'me@x.com' } as any);
        vi.spyOn(drive, 'hasDriveAccess').mockResolvedValue(true);
        vi.spyOn(drive, 'getAppFolderSummary').mockResolvedValue(summary);
        order = [];
        vi.spyOn(drive, 'trashAppFolder').mockImplementation(async () => { order.push('drive'); });
        vi.spyOn(profileService, 'deleteAccount').mockImplementation(async () => { order.push('account'); });
        cmp = TestBed.createComponent(ProfileComponent).componentInstance;
        vi.spyOn(cmp, 'logout').mockResolvedValue(undefined as any);
        cmp.showDeleteModal.set(true);
        cmp.startDeleteAccount();
        await vi.waitFor(() => expect(cmp.driveDelete().state).not.toBe('checking'));
        cmp.deleteConfirmationEmail = 'me@x.com';
    }

    const found = { found: true, folderId: 'f', files: 14, backups: 3, attachments: 11, truncated: false };

    it('shows the folder status when Drive is connected and the folder exists', async () => {
        await setup(found);
        expect(cmp.driveDelete()).toMatchObject({ state: 'ready', files: 14, backups: 3, attachments: 11 });
        expect(cmp.deleteDriveData()).toBe(false); // never ticked by default
    });

    it('offers no checkbox when there is no folder', async () => {
        await setup({ found: false, files: 0, backups: 0, attachments: 0, truncated: false });
        expect(cmp.driveDelete().state).toBe('none');
    });

    it('leaves Drive alone when the box is not ticked', async () => {
        await setup(found);
        await cmp.confirmDeleteAccount();
        expect(order).toEqual(['account']);
        expect(cmp.deletionProgress().some(s => s.table === 'google_drive')).toBe(false);
    });

    it('moves the Drive folder to the Trash BEFORE deleting the account when ticked', async () => {
        await setup(found);
        cmp.deleteDriveData.set(true);
        await cmp.confirmDeleteAccount();
        expect(order).toEqual(['drive', 'account']);
        expect(cmp.deletionProgress()[0]).toMatchObject({ table: 'google_drive', status: 'done' });
    });

    it('keeps the account when the Drive step fails, and says so', async () => {
        await setup(found);
        (drive.trashAppFolder as any).mockRejectedValue(new Error('403'));
        cmp.deleteDriveData.set(true);
        await cmp.confirmDeleteAccount();
        expect(profileService.deleteAccount).not.toHaveBeenCalled();
        expect(cmp.isDeleting()).toBe(false);
        expect(cmp.driveDeleteError()).toContain('NOT deleted');
        expect(cmp.deletionProgress().some(s => s.table === 'google_drive')).toBe(false);
        expect(cmp.deletionProgress()[0].status).toBe('pending'); // the confirm screen is back
    });

    it('does not touch Drive when the folder check failed, even if the box state was ticked', async () => {
        await setup(found);
        cmp.driveDelete.update(d => ({ ...d, state: 'error' }));
        cmp.deleteDriveData.set(true);
        await cmp.confirmDeleteAccount();
        expect(drive.trashAppFolder).not.toHaveBeenCalled();
    });
});
