import {
    Component, Input, OnInit, OnDestroy, signal, inject,
    ViewChild, TemplateRef, ViewContainerRef, ApplicationRef,
    Injector, PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TopicMedia, TopicMediaService } from '../../core/services/topic-media.service';
import { GoogleDriveService } from '../../core/services/google-drive.service';
import { AuthService } from '../../core/services/auth.service';
import { validateFiles } from '../../core/utils/file-validation';
import Swal from 'sweetalert2';


@Component({
    selector: 'app-media-gallery',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './media-gallery.component.html'
})
export class MediaGalleryComponent implements OnInit, OnDestroy {
    @Input() topicId!: string;
    @Input() subjectId!: string;
    @Input() subjectName!: string;
    @Input() topicTitle!: string;

    @ViewChild('driveModalTemplate') driveModalTemplate!: TemplateRef<any>;
    @ViewChild('lightboxTemplate') lightboxTemplate!: TemplateRef<any>;

    mediaService = inject(TopicMediaService);
    private drive = inject(GoogleDriveService);
    private auth = inject(AuthService);
    private vcr = inject(ViewContainerRef);
    private appRef = inject(ApplicationRef);
    private injector = inject(Injector);
    private platformId = inject(PLATFORM_ID);
    private sanitizer = inject(DomSanitizer);

    private portalOutlet?: DomPortalOutlet;


    media = signal<TopicMedia[]>([]);
    thumbnails = signal<Record<string, string>>({});
    loading = signal(true);
    hasDriveAccess = signal(false);
    showDriveModal = signal(false);
    brokenFiles = signal<Set<string>>(new Set());
    deletingId = signal<string | null>(null);

    uploadingFiles = signal<Record<string, { name: string; percent: number }>>({});
    overallProgress = signal(0);
    totalFiles = signal(0);
    completedFiles = signal(0);

    // Lightbox & Transform State
    lightboxOpen = signal(false);
    lightboxIndex = signal(0);
    lightboxUrl = signal<string | null>(null);
    safeLightboxUrl = signal<SafeResourceUrl | null>(null);
    lightboxLoading = signal(false);
    zoomLevel = signal<number>(1);
    panOffset = signal<{ x: number; y: number }>({ x: 0, y: 0 });
    rotation = signal<number>(0);
    isFullscreen = signal<boolean>(false);
    showControls = signal<boolean>(true);
    isDragging = signal<boolean>(false);
    touchSwipeY = signal<number>(0);

    copiedId = signal<string | null>(null);
    showLinkMenu = signal<string | null>(null);

    // Touch & Mouse Drag Tracking
    private dragStart = { x: 0, y: 0 };
    private initialPan = { x: 0, y: 0 };
    private touchStartDist = 0;
    private initialTouchZoom = 1;
    private touchStartX = 0;
    private touchStartY = 0;
    private lastTapTime = 0;
    readonly Math = Math;

    objectEntries(obj: Record<string, any>) {
        return Object.entries(obj);
    }

    async ngOnInit() {
        this.hasDriveAccess.set(await this.drive.hasDriveAccess());
        if (this.hasDriveAccess()) await this.loadMedia();
    }

    ngOnDestroy() {
        if (isPlatformBrowser(this.platformId)) {
            document.removeEventListener('keydown', this.onKey);
            document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        }
        this.detachModal();
        this.portalOutlet?.dispose();
    }

    async loadMedia() {
        this.loading.set(true);
        try {
            const items = await this.mediaService.getMedia(this.topicId);
            this.media.set(items);
            items.filter(i => this.isImage(i.mime_type)).forEach(i => this.loadThumb(i));
        } finally {
            this.loading.set(false);
        }
    }

    async loadThumb(item: TopicMedia) {
        try {
            const url = await this.drive.getFileUrl(item.drive_file_id);
            this.thumbnails.update(t => ({ ...t, [item.id]: url }));
        } catch {
            // Mark as broken — deleted from Drive
            this.brokenFiles.update(s => new Set([...s, item.id]));
        }
    }

    async deleteMedia(event: Event, item: TopicMedia) {
        event.stopPropagation();
        event.preventDefault();
        this.deletingId.set(item.id);
        try {
            await this.mediaService.delete(item.id, item.drive_file_id);
            this.media.update(m => m.filter(f => f.id !== item.id));
            this.thumbnails.update(t => { delete t[item.id]; return { ...t }; });
            this.brokenFiles.update(s => { s.delete(item.id); return new Set(s); });
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            this.deletingId.set(null);
        }
    }

    onThumbnailClick(index: number, item: TopicMedia, event: Event) {
        const target = event.target as HTMLElement;
        // Check if click came from a button or any element inside a button
        if (target.closest('button') || target.tagName === 'BUTTON') return;
        if (!this.brokenFiles().has(item.id)) {
            this.openLightbox(index);
        }
    }

    async onFilesSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;

        const userId = this.auth.currentUser()?.id;
        if (!userId) return;

        const allFiles = Array.from(input.files);
        const { valid, errors } = validateFiles(allFiles);

        if (errors.length > 0) {
            const isMixed = valid.length > 0;
            await Swal.fire({
                title: errors.length === 1 ? 'File Not Allowed' : `${errors.length} Files Not Allowed`,
                html: `
        <div style="text-align:left; font-size:13px; color:#94a3b8; line-height:1.6">
          ${errors.map(e => `<div style="margin-bottom:6px">⚠️ ${e}</div>`).join('')}
          ${isMixed ? `<div style="margin-top:12px; padding-top:12px; border-top:1px solid #334155; color:#64748b">
            ${valid.length} valid file${valid.length > 1 ? 's' : ''} will still be uploaded.
          </div>` : ''}
        </div>
      `,
                icon: 'warning',
                confirmButtonText: isMixed ? 'Upload Valid Files' : 'Got it',
                showCancelButton: isMixed,
                cancelButtonText: 'Cancel All',
                background: '#0f172a',
                color: '#f1f5f9',
                confirmButtonColor: '#6366f1',
                cancelButtonColor: '#3f3f46',
            }).then(result => { if (result.isDismissed) valid.length = 0; });
        }

        if (!valid.length) { input.value = ''; return; }

        // Set up overall progress tracking
        this.totalFiles.set(valid.length);
        this.completedFiles.set(0);
        this.overallProgress.set(0);

        // Add placeholder slots for each uploading file
        const tempIds = valid.map((file, i) => {
            const tempId = `uploading_${Date.now()}_${i}`;
            this.uploadingFiles.update(u => ({
                ...u,
                [tempId]: { name: file.name, percent: 0 }
            }));
            return tempId;
        });

        // Upload files in parallel (up to 3 concurrent)
        const MAX_CONCURRENT = 3;
        let activeUploads = 0;
        const queue = valid.map((file, i) => ({ file, tempId: tempIds[i], index: i }));
        let queueIndex = 0;

        const uploadOne = async (file: File, tempId: string): Promise<void> => {
            try {
                const saved = await this.mediaService.upload(
                    file, this.topicId, this.topicTitle, this.subjectId, this.subjectName, userId,
                    (percent) => {
                        // Update per-file progress
                        this.uploadingFiles.update(u => ({
                            ...u,
                            [tempId]: { name: file.name, percent }
                        }));
                        // Recalculate overall progress from all files
                        const allFiles = this.uploadingFiles();
                        const perFileContribution = Object.values(allFiles).reduce((s, f) => s + f.percent, 0);
                        const base = (this.completedFiles() / this.totalFiles()) * 100;
                        const active = perFileContribution / this.totalFiles();
                        this.overallProgress.set(Math.min(99, Math.round(base + active)));
                    }
                );

                // Remove placeholder, add real item
                this.uploadingFiles.update(u => {
                    const copy = { ...u };
                    delete copy[tempId];
                    return copy;
                });
                this.completedFiles.update(c => c + 1);
                this.overallProgress.set(Math.round((this.completedFiles() / this.totalFiles()) * 100));
                this.media.update(m => [saved, ...m]);
                if (this.isImage(saved.mime_type)) this.loadThumb(saved);

            } catch (err: any) {
                // Remove placeholder on error
                this.uploadingFiles.update(u => {
                    const copy = { ...u };
                    delete copy[tempId];
                    return copy;
                });
                if (err.message?.includes('insufficient authentication scopes')) {
                    await this.auth.loginWithGoogle();
                    return;
                }
                await Swal.fire({
                    title: 'Upload Failed',
                    text: `Could not upload ${file.name}. Please try again.`,
                    icon: 'error',
                    background: '#0f172a',
                    color: '#f1f5f9',
                    confirmButtonColor: '#6366f1',
                });
            }
        };

        // Run uploads with concurrency limit
        const runPool = (): Promise<void[]> => {
            const workers: Promise<void>[] = [];
            for (let w = 0; w < Math.min(MAX_CONCURRENT, queue.length); w++) {
                workers.push(runWorker());
            }
            return Promise.all(workers);
        };

        const runWorker = async (): Promise<void> => {
            while (queueIndex < queue.length) {
                const idx = queueIndex++;
                const { file, tempId } = queue[idx];
                await uploadOne(file, tempId);
            }
        };

        await runPool();

        // Reset overall progress after short delay
        setTimeout(() => {
            this.overallProgress.set(0);
            this.totalFiles.set(0);
            this.completedFiles.set(0);
        }, 1500);

        input.value = '';
    }

    private attachModal(template: TemplateRef<any>) {
        if (!isPlatformBrowser(this.platformId)) return;
        this.detachModal();
        if (!this.portalOutlet) {
            this.portalOutlet = new DomPortalOutlet(
                document.body,
                this.appRef,
                this.injector
            );
        }
        const portal = new TemplatePortal(template, this.vcr);
        this.portalOutlet.attach(portal);
    }

    private detachModal() {
        if (this.portalOutlet?.hasAttached()) {
            this.portalOutlet.detach();
        }
    }

    connectDrive() {
        this.showDriveModal.set(true);
        if (isPlatformBrowser(this.platformId) && this.driveModalTemplate) {
            this.attachModal(this.driveModalTemplate);
        }
    }

    closeDriveModal() {
        this.showDriveModal.set(false);
        this.detachModal();
    }

    async copyLink(fileId: string, itemId: string, type: 'view' | 'download', event: Event) {
        event.stopPropagation();
        this.showLinkMenu.set(null);

        const url = type === 'view'
            ? this.drive.getDriveViewLink(fileId)
            : this.drive.getDriveDownloadLink(fileId);

        try {
            await navigator.clipboard.writeText(url);
            this.copiedId.set(itemId);
            setTimeout(() => this.copiedId.set(null), 2000);
        } catch {
            // Fallback for browsers that block clipboard
            const el = document.createElement('textarea');
            el.value = url;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            this.copiedId.set(itemId);
            setTimeout(() => this.copiedId.set(null), 2000);
        }
    }

    toggleLinkMenu(itemId: string, event: Event) {
        event.stopPropagation();
        this.showLinkMenu.set(this.showLinkMenu() === itemId ? null : itemId);
    }

    async confirmConnectDrive() {
        this.closeDriveModal();
        await this.auth.connectGoogleDrive();
    }

    openLightbox(index: number) {
        this.lightboxIndex.set(index);
        this.lightboxOpen.set(true);
        this.resetTransform();
        this.loadLightboxFile(index);
        if (isPlatformBrowser(this.platformId)) {
            document.addEventListener('keydown', this.onKey);
            document.addEventListener('fullscreenchange', this.onFullscreenChange);
            if (this.lightboxTemplate) {
                this.attachModal(this.lightboxTemplate);
            }
        }
    }

    closeLightbox() {
        this.lightboxOpen.set(false);
        this.lightboxUrl.set(null);
        this.safeLightboxUrl.set(null);
        this.resetTransform();
        if (isPlatformBrowser(this.platformId)) {
            document.removeEventListener('keydown', this.onKey);
            document.removeEventListener('fullscreenchange', this.onFullscreenChange);
            if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
            }
        }
        this.detachModal();
    }

    resetTransform() {
        this.zoomLevel.set(1);
        this.panOffset.set({ x: 0, y: 0 });
        this.rotation.set(0);
        this.touchSwipeY.set(0);
        this.isDragging.set(false);
    }

    zoomIn() {
        this.zoomLevel.update(z => Math.min(5, +(z + 0.25).toFixed(2)));
    }

    zoomOut() {
        this.zoomLevel.update(z => {
            const next = Math.max(0.5, +(z - 0.25).toFixed(2));
            if (next <= 1) this.panOffset.set({ x: 0, y: 0 });
            return next;
        });
    }

    setZoom(level: number) {
        this.zoomLevel.set(level);
        if (level <= 1) this.panOffset.set({ x: 0, y: 0 });
    }

    rotateLeft() {
        this.rotation.update(r => (r - 90 + 360) % 360);
    }

    rotateRight() {
        this.rotation.update(r => (r + 90) % 360);
    }

    toggleFullscreen() {
        if (!isPlatformBrowser(this.platformId)) return;
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
            this.isFullscreen.set(true);
        } else {
            document.exitFullscreen?.().catch(() => {});
            this.isFullscreen.set(false);
        }
    }

    private onFullscreenChange = () => {
        this.isFullscreen.set(!!document.fullscreenElement);
    };

    toggleControls() {
        this.showControls.update(s => !s);
    }

    // ── Mouse Event Handlers ────────────────────────────────────

    onWheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.deltaY < 0 ? 0.2 : -0.2;
        this.zoomLevel.update(z => {
            const next = Math.max(0.5, Math.min(5, +(z + delta).toFixed(2)));
            if (next <= 1) this.panOffset.set({ x: 0, y: 0 });
            return next;
        });
    }

    onMouseDown(event: MouseEvent) {
        if (this.zoomLevel() <= 1) return;
        event.preventDefault();
        this.isDragging.set(true);
        this.dragStart = { x: event.clientX, y: event.clientY };
        this.initialPan = { ...this.panOffset() };
    }

    onMouseMove(event: MouseEvent) {
        if (!this.isDragging()) return;
        event.preventDefault();
        const dx = event.clientX - this.dragStart.x;
        const dy = event.clientY - this.dragStart.y;
        this.panOffset.set({
            x: this.initialPan.x + dx,
            y: this.initialPan.y + dy
        });
    }

    onMouseUp() {
        this.isDragging.set(false);
    }

    onImageDoubleClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (this.zoomLevel() > 1) {
            this.resetTransform();
        } else {
            this.zoomLevel.set(2.5);
        }
    }

    // ── Touch Gesture Handlers (Mobile) ──────────────────────────

    onTouchStart(event: TouchEvent) {
        if (event.touches.length === 2) {
            // Pinch to zoom start
            const t1 = event.touches[0];
            const t2 = event.touches[1];
            this.touchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            this.initialTouchZoom = this.zoomLevel();
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.dragStart = { x: touch.clientX, y: touch.clientY };
            this.initialPan = { ...this.panOffset() };

            // Double tap detection
            const now = Date.now();
            if (now - this.lastTapTime < 300) {
                if (this.zoomLevel() > 1) {
                    this.resetTransform();
                } else {
                    this.zoomLevel.set(2.5);
                }
                this.lastTapTime = 0;
            } else {
                this.lastTapTime = now;
            }
        }
    }

    onTouchMove(event: TouchEvent) {
        if (event.touches.length === 2) {
            event.preventDefault();
            const t1 = event.touches[0];
            const t2 = event.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            if (this.touchStartDist > 0) {
                const scale = (dist / this.touchStartDist) * this.initialTouchZoom;
                const clamped = Math.max(0.5, Math.min(5, +scale.toFixed(2)));
                this.zoomLevel.set(clamped);
                if (clamped <= 1) this.panOffset.set({ x: 0, y: 0 });
            }
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;

            if (this.zoomLevel() > 1) {
                event.preventDefault();
                this.panOffset.set({
                    x: this.initialPan.x + dx,
                    y: this.initialPan.y + dy
                });
            } else {
                // Swipe down to dismiss on mobile
                if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                    event.preventDefault();
                    this.touchSwipeY.set(dy);
                }
            }
        }
    }

    onTouchEnd(event: TouchEvent) {
        if (this.touchSwipeY() > 120) {
            this.closeLightbox();
            return;
        }
        this.touchSwipeY.set(0);

        if (event.changedTouches.length === 1 && this.zoomLevel() <= 1) {
            const touch = event.changedTouches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;

            // Horizontal swipe to navigate photos
            if (Math.abs(dx) > 60 && Math.abs(dy) < 40) {
                if (dx < 0) {
                    this.nextSlide();
                } else {
                    this.prevSlide();
                }
            }
        }
    }

    // ── File actions ───────────────────────────────────────────

    downloadCurrentFile() {
        const item = this.media()[this.lightboxIndex()];
        if (!item) return;
        const dlUrl = this.drive.getDriveDownloadLink(item.drive_file_id);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = item.file_name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    openInDrive() {
        const item = this.media()[this.lightboxIndex()];
        if (!item) return;
        const viewUrl = this.drive.getDriveViewLink(item.drive_file_id);
        window.open(viewUrl, '_blank');
    }

    async loadLightboxFile(index: number) {
        const item = this.media()[index];
        if (!item) return;
        this.lightboxLoading.set(true);
        this.lightboxUrl.set(null);
        this.safeLightboxUrl.set(null);
        try {
            const url = await this.drive.getFileUrl(item.drive_file_id);
            this.lightboxUrl.set(url);
            this.safeLightboxUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        } finally {
            this.lightboxLoading.set(false);
        }
    }

    prevSlide() {
        this.resetTransform();
        const i = (this.lightboxIndex() - 1 + this.media().length) % this.media().length;
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    nextSlide() {
        this.resetTransform();
        const i = (this.lightboxIndex() + 1) % this.media().length;
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    goToSlide(i: number) {
        if (i === this.lightboxIndex()) return;
        this.resetTransform();
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    onKey = (e: KeyboardEvent) => {
        if (!this.lightboxOpen()) return;
        switch (e.key) {
            case 'ArrowLeft':
                this.prevSlide();
                break;
            case 'ArrowRight':
                this.nextSlide();
                break;
            case 'Escape':
                this.closeLightbox();
                break;
            case '+':
            case '=':
                this.zoomIn();
                break;
            case '-':
            case '_':
                this.zoomOut();
                break;
            case '0':
            case 'r':
            case 'R':
                this.resetTransform();
                break;
            case 'f':
            case 'F':
                this.toggleFullscreen();
                break;
        }
    };

    isImage(mime: string) { return mime.startsWith('image/'); }
    isVideo(mime: string) { return mime.startsWith('video/'); }

    connectDrive2() { inject(AuthService).connectGoogleDrive(); }
}