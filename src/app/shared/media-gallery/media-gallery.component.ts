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
    template: `
    <div class="mb-4">

      <!-- No Drive access: prompt -->
      @if (!hasDriveAccess()) {
        <div class="flex items-center justify-between p-3 rounded-xl
                     border border-slate-700/50">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-slate-400" viewBox="0 0 87.3 78" fill="none">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 49.15A9 9 0 000 53.65h27.5z" fill="#00ac47"/>
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.8z" fill="#ea4335"/>
              <path d="M43.65 25L57.4 1.2A9.06 9.06 0 0053.65 0H33.65a9 9 0 00-3.75.8z" fill="#00832d"/>
              <path d="M59.8 53.65H27.5L13.75 77.45c1.35.55 2.8.85 4.25.85h50.3c1.45 0 2.9-.3 4.25-.85z" fill="#2684fc"/>
              <path d="M73.4 26.35l-12.8-22.15c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28.65H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
            <span class="text-xs text-slate-400">Connect Google Drive to attach media</span>
          </div>
          <button
            (click)="connectDrive()"
            class="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20
                   text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40
                   transition-all duration-200"
          >Connect Drive</button>
        </div>
      }

      <!-- Has Drive access -->
      @if (hasDriveAccess()) {
        <div class="space-y-3">

          <!-- Header row -->
          <div class="flex items-center justify-between">
  <div class="flex items-center gap-2">
    <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
    <span class="text-xs font-medium text-slate-400">Media</span>
    @if (media().length > 0) {
      <span class="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">
        {{ media().length }}
      </span>
    }
  </div>

  <div>
    <input #fileInput type="file" class="hidden"
      accept="*/*" multiple
      (change)="onFilesSelected($event)" />
    <button
      (click)="fileInput.click()"
      [disabled]="mediaService.uploading()"
      class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg
             bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-300
             border border-slate-700 hover:border-slate-600
             transition-all duration-200 disabled:opacity-50"
    >
      @if (mediaService.uploading()) {
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Uploading {{ completedFiles() + 1 }}/{{ totalFiles() }}...
      } @else {
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Add Media
      }
    </button>
  </div>
</div>

<!-- Overall progress bar -->
@if (totalFiles() > 0 && overallProgress() > 0) {
  <div class="space-y-1">
    <div class="flex items-center justify-between">
      <span class="text-[10px] text-slate-500">
        Uploading {{ completedFiles() }} of {{ totalFiles() }} files
      </span>
      <span class="text-[10px] text-indigo-400 font-medium">{{ overallProgress() }}%</span>
    </div>
    <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
      <div
        class="h-full bg-indigo-500 rounded-full transition-all duration-300"
        [style.width.%]="overallProgress()"
      ></div>
    </div>
  </div>
}

          <!-- Loading skeletons -->
          @if (loading()) {
            <div class="flex gap-2">
              @for (i of [1,2,3]; track i) {
                <div class="w-20 h-20 rounded-lg bg-slate-800 animate-pulse flex-shrink-0"></div>
              }
            </div>
          }

          <!-- Empty state -->
          @if (!loading() && media().length === 0) {
            <div class="flex items-center gap-2 py-3 px-3 rounded-lg border border-dashed border-slate-700/60">
              <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="text-xs text-slate-600">No media yet — drag files or click Add Media</span>
            </div>
          }

          <!-- Thumbnail strip -->
          @if (!loading() && media().length > 0) {
            <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
                  <!-- Uploading placeholders -->
  @for (entry of objectEntries(uploadingFiles()); track entry[0]) {
    <div class="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden
                ring-1 ring-indigo-500/40 bg-slate-800/80 flex flex-col
                items-center justify-center gap-1.5 p-2">
      <!-- Circular progress -->
      <svg class="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#1e293b" stroke-width="3"/>
        <circle cx="16" cy="16" r="12" fill="none" stroke="#6366f1" stroke-width="3"
          stroke-linecap="round"
          [attr.stroke-dasharray]="75.4"
          [attr.stroke-dashoffset]="75.4 - (75.4 * entry[1].percent / 100)"
          style="transition: stroke-dashoffset 0.3s ease"/>
      </svg>
      <span class="text-[9px] text-indigo-400 font-medium">{{ entry[1].percent }}%</span>
      <span class="text-[8px] text-slate-500 text-center leading-tight truncate w-full text-center">
        {{ entry[1].name }}
      </span>
    </div>
  }
              @for (item of media(); track item.id; let i = $index) {
  <div class="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden
               ring-1 ring-slate-700/60 transition-all duration-200 group"
       [class]="brokenFiles().has(item.id) ? 'opacity-60' : 'hover:ring-indigo-500/60 hover:scale-105 cursor-pointer'"
       (click)="!brokenFiles().has(item.id) && openLightbox(i)">

    <!-- Broken / deleted from Drive -->
    @if (brokenFiles().has(item.id)) {
      <div class="w-full h-full bg-slate-800/80 flex flex-col items-center justify-center gap-1 p-1">
        <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <span class="text-[9px] text-slate-500 text-center leading-tight">Deleted from Drive</span>
      </div>

    <!-- Normal image -->
    } @else if (isImage(item.mime_type) && thumbnails()[item.id]) {
      <img [src]="thumbnails()[item.id]" [alt]="item.file_name"
        class="w-full h-full object-cover" />

    <!-- Video -->
    } @else if (isVideo(item.mime_type)) {
      <div class="w-full h-full bg-slate-800/80 flex items-center justify-center">
        <svg class="w-6 h-6 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>

    <!-- PDF / other -->
    } @else {
      <div class="w-full h-full bg-slate-800/80 flex items-center justify-center">
        <svg class="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
      </div>
    }

    <!-- Delete button (always visible on hover) -->
    <div class="absolute inset-0 flex items-start justify-end p-1
                opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        (click)="deleteMedia($event, item)"
        [disabled]="deletingId() === item.id"
        class="w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500
               flex items-center justify-center transition-colors
               disabled:opacity-50"
        title="Delete media"
      >
        @if (deletingId() === item.id) {
          <svg class="w-2.5 h-2.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        } @else {
          <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        }
      </button>
    </div>

  </div>
}
            </div>
            <!-- Drive badge -->
            <div class="flex items-center gap-1">
              <svg class="w-2.5 h-2.5" viewBox="0 0 87.3 78">
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 49.15A9 9 0 000 53.65h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.8z" fill="#ea4335"/>
                <path d="M43.65 25L57.4 1.2A9.06 9.06 0 0053.65 0H33.65a9 9 0 00-3.75.8z" fill="#00832d"/>
                <path d="M59.8 53.65H27.5L13.75 77.45c1.35.55 2.8.85 4.25.85h50.3c1.45 0 2.9-.3 4.25-.85z" fill="#2684fc"/>
                <path d="M73.4 26.35l-12.8-22.15c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28.65H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <span class="text-[10px] text-slate-600">Stored in your Google Drive</span>
            </div>
          }

        </div>
      }

<!-- Drive permission explanation modal -->
@if (showDriveModal()) {
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
       (click)="showDriveModal.set(false)">
    <div class="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
         (click)="$event.stopPropagation()">

      <!-- Icon -->
      <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20
                  flex items-center justify-center mb-4">
        <svg class="w-6 h-6" viewBox="0 0 87.3 78">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 49.15A9 9 0 000 53.65h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.8z" fill="#ea4335"/>
          <path d="M43.65 25L57.4 1.2A9.06 9.06 0 0053.65 0H33.65a9 9 0 00-3.75.8z" fill="#00832d"/>
          <path d="M59.8 53.65H27.5L13.75 77.45c1.35.55 2.8.85 4.25.85h50.3c1.45 0 2.9-.3 4.25-.85z" fill="#2684fc"/>
          <path d="M73.4 26.35l-12.8-22.15c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28.65H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      </div>

      <!-- Text -->
      <h3 class="text-base font-semibold text-slate-100 mb-2">
        Connect Google Drive
      </h3>
      <p class="text-sm text-slate-400 mb-3 leading-relaxed">
        NextLyr will store your media files directly in <span class="text-slate-300 font-medium">your own Google Drive</span> — we never upload anything to our servers.
      </p>

      <!-- Folder path preview -->
      <div class="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2 mb-5">
        <p class="text-[11px] text-slate-500 mb-1">Files will be saved to:</p>
        <p class="text-xs text-indigo-400 font-mono">
          NextLyr SkillTracker / {{ subjectName }} / {{ topicTitle }}
        </p>
      </div>

      <!-- What we access -->
      <div class="space-y-2 mb-5">
        <div class="flex items-start gap-2">
          <svg class="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <p class="text-xs text-slate-400">Only files <span class="text-slate-300">created by NextLyr</span> are accessible</p>
        </div>
        <div class="flex items-start gap-2">
          <svg class="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <p class="text-xs text-slate-400">We cannot read your existing Drive files</p>
        </div>
        <div class="flex items-start gap-2">
          <svg class="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <p class="text-xs text-slate-400">You can delete files anytime from your Drive</p>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-2">
        <button
          (click)="showDriveModal.set(false)"
          class="flex-1 text-sm py-2 rounded-lg bg-slate-800 hover:bg-slate-700
                 text-slate-400 hover:text-slate-300 border border-slate-700
                 transition-all duration-200"
        >Cancel</button>
        <button
          (click)="confirmConnectDrive()"
          class="flex-1 text-sm py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400
                 text-white font-medium transition-all duration-200"
        >Connect Drive</button>
      </div>

    </div>
  </div>
}

      <!-- Lightbox -->
      @if (lightboxOpen()) {
        <div class="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center"
             (click)="closeLightbox()">
          <div class="relative w-full h-full flex items-center justify-center p-6"
               (click)="$event.stopPropagation()">

            <!-- Close -->
            <button (click)="closeLightbox()"
              class="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-800
                     hover:bg-slate-700 flex items-center justify-center transition-colors">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>

            <!-- Counter -->
            <div class="absolute top-4 left-1/2 -translate-x-1/2 text-center">
              <p class="text-sm text-white">{{ media()[lightboxIndex()].file_name }}</p>
              <p class="text-xs text-slate-500 mt-0.5">{{ lightboxIndex() + 1 }} / {{ media().length }}</p>
            </div>

            <!-- Prev -->
            @if (media().length > 1) {
              <button (click)="prevSlide()"
                class="absolute left-4 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700
                       flex items-center justify-center transition-colors z-10">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
            }

            <!-- Content -->
            <div class="max-w-4xl max-h-[80vh] flex items-center justify-center">
              @if (lightboxLoading()) {
                <div class="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
              } @else if (lightboxUrl()) {
                @if (isImage(media()[lightboxIndex()].mime_type)) {
                  <img [src]="lightboxUrl()!" [alt]="media()[lightboxIndex()].file_name"
                    class="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl" />
                } @else if (isVideo(media()[lightboxIndex()].mime_type)) {
                  <video [src]="lightboxUrl()!" controls
                    class="max-w-full max-h-[80vh] rounded-xl shadow-2xl"></video>
                } @else {
                  <iframe [src]="lightboxUrl()!"
                    class="w-[780px] h-[560px] rounded-xl shadow-2xl border-0"></iframe>
                }
              }
            </div>

            <!-- Next -->
            @if (media().length > 1) {
              <button (click)="nextSlide()"
                class="absolute right-4 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700
                       flex items-center justify-center transition-colors z-10">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            }

            <!-- Dot indicators -->
            @if (media().length > 1) {
              <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                @for (item of media(); track item.id; let i = $index) {
                  <button (click)="goToSlide(i)"
                    class="h-1.5 rounded-full transition-all duration-200"
                    [class]="i === lightboxIndex() ? 'w-4 bg-indigo-400' : 'w-1.5 bg-slate-600 hover:bg-slate-400'">
                  </button>
                }
              </div>
            }

          </div>
        </div>
      }

    </div>
  `
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