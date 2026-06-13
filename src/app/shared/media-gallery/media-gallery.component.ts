import {
    Component, Input, OnInit, signal, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class MediaGalleryComponent implements OnInit {
    @Input() topicId!: string;
    @Input() subjectId!: string;
    @Input() subjectName!: string;
    @Input() topicTitle!: string;

    mediaService = inject(TopicMediaService);
    private drive = inject(GoogleDriveService);
    private auth = inject(AuthService);


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

    lightboxOpen = signal(false);
    lightboxIndex = signal(0);
    lightboxUrl = signal<string | null>(null);
    lightboxLoading = signal(false);

    copiedId = signal<string | null>(null);
    showLinkMenu = signal<string | null>(null);

    objectEntries(obj: Record<string, any>) {
        return Object.entries(obj);
    }

    async ngOnInit() {
        this.hasDriveAccess.set(await this.drive.hasDriveAccess());
        if (this.hasDriveAccess()) await this.loadMedia();
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

        // Upload files one by one
        for (let i = 0; i < valid.length; i++) {
            const file = valid[i];
            const tempId = tempIds[i];

            try {
                const saved = await this.mediaService.upload(
                    file, this.topicId, this.topicTitle, this.subjectId, this.subjectName, userId,
                    (percent) => {
                        // Update per-file progress
                        this.uploadingFiles.update(u => ({
                            ...u,
                            [tempId]: { name: file.name, percent }
                        }));
                        // Update overall progress
                        const base = (this.completedFiles() / this.totalFiles()) * 100;
                        const current = (percent / this.totalFiles());
                        this.overallProgress.set(Math.round(base + current));
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
        }

        // Reset overall progress after short delay
        setTimeout(() => {
            this.overallProgress.set(0);
            this.totalFiles.set(0);
            this.completedFiles.set(0);
        }, 1500);

        input.value = '';
    }

    connectDrive() {
        this.showDriveModal.set(true);
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
        this.showDriveModal.set(false);
        await this.auth.connectGoogleDrive();
    }

    openLightbox(index: number) {
        this.lightboxIndex.set(index);
        this.lightboxOpen.set(true);
        this.loadLightboxFile(index);
        document.addEventListener('keydown', this.onKey);
    }

    closeLightbox() {
        this.lightboxOpen.set(false);
        this.lightboxUrl.set(null);
        document.removeEventListener('keydown', this.onKey);
    }

    async loadLightboxFile(index: number) {
        const item = this.media()[index];
        if (!item) return;
        this.lightboxLoading.set(true);
        this.lightboxUrl.set(null);
        try {
            const url = await this.drive.getFileUrl(item.drive_file_id);
            this.lightboxUrl.set(url);
        } finally {
            this.lightboxLoading.set(false);
        }
    }



    prevSlide() {
        const i = (this.lightboxIndex() - 1 + this.media().length) % this.media().length;
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    nextSlide() {
        const i = (this.lightboxIndex() + 1) % this.media().length;
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    goToSlide(i: number) {
        this.lightboxIndex.set(i);
        this.loadLightboxFile(i);
    }

    onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') this.prevSlide();
        if (e.key === 'ArrowRight') this.nextSlide();
        if (e.key === 'Escape') this.closeLightbox();
    };

    isImage(mime: string) { return mime.startsWith('image/'); }
    isVideo(mime: string) { return mime.startsWith('video/'); }

    connectDrive2() { inject(AuthService).connectGoogleDrive(); }
}