import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MediaGalleryComponent } from './media-gallery.component';
import { TopicMediaService, TopicMedia } from '../../core/services/topic-media.service';
import { GoogleDriveService } from '../../core/services/google-drive.service';
import { AuthService } from '../../core/services/auth.service';
import { PendingDeleteService } from '../../core/services/pending-delete.service';

describe('MediaGalleryComponent: PDF viewer & back-navigation state', () => {
    let fixture: ComponentFixture<MediaGalleryComponent>;
    let component: MediaGalleryComponent;
    let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
    let router: { navigate: ReturnType<typeof vi.fn> };
    let location: { back: ReturnType<typeof vi.fn> };
    let drive: Record<string, ReturnType<typeof vi.fn>>;
    let mediaService: { getMedia: ReturnType<typeof vi.fn>; uploading: ReturnType<typeof vi.fn> };

    const pdfItem: TopicMedia = {
        id: 'm-pdf',
        drive_file_id: 'drive-pdf-1',
        file_name: 'notes.pdf',
        mime_type: 'application/pdf',
        created_at: ''
    };

    const imgItem: TopicMedia = {
        id: 'm-img',
        drive_file_id: 'drive-img-1',
        file_name: 'diagram.png',
        mime_type: 'image/png',
        created_at: ''
    };

    beforeEach(async () => {
        queryParams$ = new BehaviorSubject(convertToParamMap({ topic: 't1' }));
        router = { navigate: vi.fn().mockResolvedValue(true) };
        location = { back: vi.fn() };
        drive = {
            hasDriveAccess: vi.fn().mockResolvedValue(true),
            getFileBlob: vi.fn().mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
            getFileUrl: vi.fn().mockResolvedValue('blob:mock-image'),
            getFileText: vi.fn(),
            getDriveViewLink: vi.fn((id: string) => `https://drive.google.com/file/d/${id}/view`),
            getDriveDownloadLink: vi.fn((id: string) => `https://drive.google.com/uc?export=download&id=${id}`)
        };
        mediaService = {
            getMedia: vi.fn().mockResolvedValue([pdfItem, imgItem]),
            uploading: vi.fn().mockReturnValue(false)
        };

        TestBed.overrideComponent(MediaGalleryComponent, { set: { template: '', imports: [] } });
        await TestBed.configureTestingModule({
            imports: [MediaGalleryComponent],
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: {
                        get snapshot() { return { queryParamMap: queryParams$.value }; },
                        queryParamMap: queryParams$.asObservable()
                    }
                },
                { provide: Router, useValue: router },
                { provide: Location, useValue: location },
                { provide: TopicMediaService, useValue: mediaService },
                { provide: GoogleDriveService, useValue: drive },
                { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1' }) } },
                { provide: PendingDeleteService, useValue: { isPending: () => false } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(MediaGalleryComponent);
        component = fixture.componentInstance;
        component.topicId = 't1';
        component.subjectId = 's1';
        component.subjectName = 'Reasoning';
        component.topicTitle = 'Daily Revision';
        await component.ngOnInit();
    });

    afterEach(() => {
        fixture.destroy();
    });

    it('loads PDFs as a Blob for the in-app PDF.js viewer and pushes media history', async () => {
        component.openLightbox(0);
        await Promise.resolve();
        await Promise.resolve();

        expect(component.lightboxOpen()).toBe(true);
        expect(component.isPdfSlide()).toBe(true);
        expect(drive['getFileBlob']).toHaveBeenCalledWith('drive-pdf-1', 'application/pdf');
        expect(component.lightboxPdfBlob()).toBeInstanceOf(Blob);
        expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
            queryParams: { media: 'm-pdf' },
            queryParamsHandling: 'merge'
        }));
    });

    it('pops browser history on close when opened from UI, and closes on back popstate', async () => {
        component.openLightbox(0);
        await Promise.resolve();
        queryParams$.next(convertToParamMap({ topic: 't1', media: 'm-pdf' }));

        component.closeLightbox();
        expect(component.lightboxOpen()).toBe(false);
        expect(location.back).toHaveBeenCalledTimes(1);

        // Simulate Android system Back button clearing ?media while lightbox is open
        component.openLightbox(0);
        await Promise.resolve();
        queryParams$.next(convertToParamMap({ topic: 't1', media: 'm-pdf' }));
        expect(component.lightboxOpen()).toBe(true);

        queryParams$.next(convertToParamMap({ topic: 't1' }));
        expect(component.lightboxOpen()).toBe(false);
    });

    it('restores an open attachment when ?media is present on load', async () => {
        queryParams$.next(convertToParamMap({ topic: 't1', media: 'm-pdf' }));
        await component.loadMedia();
        await Promise.resolve();

        expect(component.lightboxOpen()).toBe(true);
        expect(component.lightboxIndex()).toBe(0);
    });
});
