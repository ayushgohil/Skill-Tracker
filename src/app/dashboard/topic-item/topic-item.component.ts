// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, input, output, signal, computed, effect, OnDestroy, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { TopicWithProgress, Depth } from '../../core/models';
import { PomodoroService } from '../../core/services/pomodoro.service';
import Swal from 'sweetalert2';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Inject } from '@angular/core';
import { MediaGalleryComponent } from '../../shared/media-gallery/media-gallery.component';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

export interface ProgressChange {
    topicId: string;
    completed: boolean;
    notes: string;
}

export interface TopicEditEvent {
    topicId: string;
    title: string;
    depth: Depth;
}

export interface SubtopicToggleEvent {
    subtopicId: string;
    completed: boolean;
    topicId: string;
}

export interface SubtopicAddEvent {
    topicId: string;
    title: string;
}

export interface SubtopicDeleteEvent {
    subtopicId: string;
    topicId: string;
}

import { expandCollapse } from '../../core/animations/app.animations';

@Component({
    selector: 'app-topic-item',
    standalone: true,
    imports: [FormsModule, QuillModule, MediaGalleryComponent],
    templateUrl: './topic-item.component.html',
    animations: [expandCollapse]
})
export class TopicItemComponent implements OnDestroy, OnInit {
    // ── Signal inputs ─────────────────────────────────
    topic = input.required<TopicWithProgress>();
    isOpen = input<boolean>(false);

    // ── Signal outputs ────────────────────────────────
    toggleOpen = output<string>();
    progressChanged = output<ProgressChange>();
    topicEdited = output<TopicEditEvent>();
    topicDeleted = output<string>();
    subtopicToggled = output<SubtopicToggleEvent>();
    subtopicAdded = output<SubtopicAddEvent>();
    subtopicDeleted = output<SubtopicDeleteEvent>();

    // ── Local state ───────────────────────────────────
    localNotes = '';
    notesDirty = false;

    // ── Auto-save ────────────────────────────────────
    saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
    private notesChanged$ = new Subject<void>();
    private notesSubscription?: Subscription;
    private savedTimeout?: ReturnType<typeof setTimeout>;

    editing = signal(false);
    editTitle = '';
    editDepth: Depth = 'medium';

    addingSubtopic = signal(false);
    newSubtopicTitle = '';

    // ── Google Drive ───────────────────────────────────
    subjectName = input.required<string>();

    // Kebab menu
    static openMenuId = signal<string | null>(null);
    showMenu = computed(() => TopicItemComponent.openMenuId() === this.topic().id);
    private readonly menuClass = 'topic-kebab-menu';
    private boundCloseMenu = (e: MouseEvent) => this.closeMenuOnOutsideClick(e);

    readonly depthConfig: Record<Depth, { label: string; classes: string }> = {
        shallow: { label: 'Shallow', classes: 'bg-zinc-800 text-zinc-400' },
        medium: { label: 'Medium', classes: 'bg-amber-500/20 text-amber-400' },
        deep: { label: 'Deep', classes: 'bg-red-500/20 text-red-400' }
    };

    // ── Computed (fully reactive via signal inputs) ───
    hasSubtopics = computed(() => this.topic().subtopics.length > 0);

    allSubtopicsComplete = computed(() =>
        this.topic().subtopics.length > 0 &&
        this.topic().subtopics.every(s => s.completed)
    );

    isTopicChecked = computed(() =>
        this.hasSubtopics()
            ? this.allSubtopicsComplete()
            : this.topic().completed
    );

    subtopicCompletedCount = computed(() =>
        this.topic().subtopics.filter(s => s.completed).length
    );

    subtopicTotalCount = computed(() =>
        this.topic().subtopics.length
    );

    // ── Effect replaces ngOnChanges ───────────────────
    constructor(
        public pomodoro: PomodoroService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        effect(() => {
            if (this.isOpen()) {
                this.localNotes = this.topic().notes;
                this.notesDirty = false;
                this.saveStatus.set('idle');
            }
        });
        document.addEventListener('click', this.boundCloseMenu);

        if (isPlatformBrowser(this.platformId)) {
            Promise.all([
                import('quill'),
                import('quill-magic-url')
            ]).then(([QuillModule, MagicUrlModule]) => {
                let Quill: any = QuillModule;
                if (Quill && typeof Quill !== 'function' && Quill.default) Quill = Quill.default;

                let MagicUrl: any = MagicUrlModule;
                if (MagicUrl && typeof MagicUrl !== 'function' && MagicUrl.default) MagicUrl = MagicUrl.default;
                if (MagicUrl && typeof MagicUrl !== 'function' && MagicUrl.default) MagicUrl = MagicUrl.default;

                // Register if not already registered
                if (!Quill.imports['modules/magicUrl']) {
                    Quill.register('modules/magicUrl', MagicUrl);
                }
            }).catch(err => console.error('Failed to load magic url:', err));
        }
    }

    ngOnInit() {
        // Debounced auto-save: triggers 800ms after the last change
        this.notesSubscription = this.notesChanged$.pipe(
            debounceTime(800)
        ).subscribe(() => {
            this.performNoteSave();
        });
    }

    ngOnDestroy() {
        document.removeEventListener('click', this.boundCloseMenu);
        this.notesSubscription?.unsubscribe();
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
    }

    private closeMenuOnOutsideClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (!target.closest('.' + this.menuClass)) {
            if (TopicItemComponent.openMenuId() === this.topic().id) {
                TopicItemComponent.openMenuId.set(null);
            }
        }
    }

    // ── Title Case helper ─────────────────────────────
    toTitleCase(value: string): string {
        return value.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1));
    }

    // ── Actions ───────────────────────────────────────
    onToggle() {
        if (!this.editing()) this.toggleOpen.emit(this.topic().id);
    }

    onCheck(event: Event) {
        event.stopPropagation();
        // Disable manual toggle when subtopics exist
        if (this.hasSubtopics()) return;
        this.progressChanged.emit({
            topicId: this.topic().id,
            completed: !this.topic().completed,
            notes: this.topic().notes
        });
    }

    @HostListener('click', ['$event'])
    onLinkClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href) {
            window.open(anchor.href, '_blank');
        }
    }

    onNotesInput() {
        this.notesDirty = true;
        this.saveStatus.set('saving');
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
        this.notesChanged$.next();
    }

    /** Immediate save on blur as fallback (e.g. user switches tab) */
    onNotesBlur() {
        if (this.notesDirty) {
            this.performNoteSave();
        }
    }

    private performNoteSave() {
        if (!this.notesDirty) return;
        this.saveStatus.set('saving');
        this.progressChanged.emit({
            topicId: this.topic().id,
            completed: this.topic().completed,
            notes: this.localNotes
        });
        this.notesDirty = false;

        // Show "Saved" for 2 seconds, then fade back to idle
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
        this.savedTimeout = setTimeout(() => {
            this.saveStatus.set('saved');
            this.savedTimeout = setTimeout(() => {
                this.saveStatus.set('idle');
            }, 2000);
        }, 300);
    }

    toggleMenu(event: Event) {
        event.stopPropagation();
        if (TopicItemComponent.openMenuId() === this.topic().id) {
            TopicItemComponent.openMenuId.set(null);
        } else {
            TopicItemComponent.openMenuId.set(this.topic().id);
        }
    }

    startEdit(event: Event) {
        event.stopPropagation();
        this.editTitle = this.topic().title;
        this.editDepth = this.topic().depth;
        this.editing.set(true);
        TopicItemComponent.openMenuId.set(null);
    }

    cancelEdit() { this.editing.set(false); }

    saveEdit(event?: Event) {
        event?.stopPropagation();
        if (!this.editTitle.trim()) return;
        this.topicEdited.emit({
            topicId: this.topic().id,
            title: this.toTitleCase(this.editTitle.trim()),
            depth: this.editDepth
        });
        this.editing.set(false);
    }

    async onDelete(event: Event) {
        event.stopPropagation();
        TopicItemComponent.openMenuId.set(null);
        const result = await Swal.fire({
            title: 'Delete Topic?',
            text: `"${this.topic().title}" will be permanently removed.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it',
            cancelButtonText: 'Cancel',
            background: '#18181b',
            color: '#f4f4f5',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#3f3f46',
            customClass: {
                popup: 'swal-dark-popup'
            }
        });
        if (result.isConfirmed) {
            this.topicDeleted.emit(this.topic().id);
        }
    }

    // ── Subtopic actions ──────────────────────────────
    onSubtopicCheck(subtopicId: string, currentCompleted: boolean) {
        this.subtopicToggled.emit({
            subtopicId,
            completed: !currentCompleted,
            topicId: this.topic().id
        });
    }

    async onSubtopicDelete(event: Event, subtopicId: string) {
        event.stopPropagation();
        const result = await Swal.fire({
            title: 'Delete Subtopic?',
            text: 'This subtopic will be permanently removed.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it',
            cancelButtonText: 'Cancel',
            background: '#18181b',
            color: '#f4f4f5',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#3f3f46'
        });
        if (!result.isConfirmed) return;
        this.subtopicDeleted.emit({
            subtopicId,
            topicId: this.topic().id
        });
    }

    submitSubtopic() {
        if (!this.newSubtopicTitle.trim()) return;
        this.subtopicAdded.emit({
            topicId: this.topic().id,
            title: this.toTitleCase(this.newSubtopicTitle.trim())
        });
        this.newSubtopicTitle = '';
        this.addingSubtopic.set(false);
    }

    cancelAddSubtopic() {
        this.newSubtopicTitle = '';
        this.addingSubtopic.set(false);
    }
}