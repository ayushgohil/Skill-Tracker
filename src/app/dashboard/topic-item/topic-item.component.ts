// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, input, output, signal, computed, effect, untracked, viewChild, ElementRef, OnDestroy, OnInit, HostListener } from '@angular/core';
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
import hljs from 'highlight.js';

// Attach highlight.js to window before any Quill instance initializes
if (typeof window !== 'undefined') {
    (window as any).hljs = hljs;
}

let quillInitPromise: Promise<void> | null = null;
function ensureQuillPlugins() {
    if (!quillInitPromise && typeof window !== 'undefined') {
        quillInitPromise = Promise.all([
            import('quill'),
            import('quill-magic-url')
        ]).then(([QuillModule, MagicUrlModule]) => {
            let Quill: any = QuillModule?.default ?? QuillModule;
            let MagicUrl: any = MagicUrlModule?.default ?? MagicUrlModule;
            if (MagicUrl?.default) MagicUrl = MagicUrl.default;

            if (Quill?.imports && !Quill.imports['modules/magicUrl']) {
                Quill.register('modules/magicUrl', MagicUrl);
            }
        }).catch(err => console.error('Failed to load magic url:', err));
    }
    return quillInitPromise;
}

export interface ProgressChange {
    topicId: string;
    completed: boolean;
    notes: string;
    /** Called with the real result of the save, so the "Saved" label can tell the truth. */
    onResult?: (saved: boolean) => void;
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
    saveStatus = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');
    /** Counts note saves, so a late answer from an older save cannot change the label. */
    private saveSeq = 0;
    private notesChanged$ = new Subject<void>();
    private notesSubscription?: Subscription;
    private savedTimeout?: ReturnType<typeof setTimeout>;

    // ── Notes full screen ─────────────────────────────
    notesFullscreen = signal(false);
    /** Shown after the first Esc: "Press Esc again to close". */
    escHint = signal(false);
    private notesWrap = viewChild<ElementRef<HTMLElement>>('notesWrap');
    private fsBtn = viewChild<ElementRef<HTMLButtonElement>>('fsBtn');
    /** Marks where the notes section lives, while it is moved to <body> for full screen. */
    private fsPlaceholder?: Comment;
    private fsClosing = false;
    private lastEscAt = 0;
    private escHintTimeout?: ReturnType<typeof setTimeout>;
    private closeTimeout?: ReturnType<typeof setTimeout>;
    private readonly ESC_WINDOW_MS = 1500;
    private readonly CLOSE_ANIM_MS = 170;
    private boundFsKeydown = (e: KeyboardEvent) => this.onFullscreenKeydown(e);

    editing = signal(false);
    editTitle = '';
    editDepth: Depth = 'medium';

    addingSubtopic = signal(false);
    newSubtopicTitle = '';

    // ── Google Drive ───────────────────────────────────
    subjectName = input.required<string>();

    // ── Study Partner Collaboration ────────────────────
    partnerName = input<string | undefined>(undefined);
    activeNotesTab = signal<'mine' | 'partner'>('mine');

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
            const open = this.isOpen();
            const notes = this.topic().notes;
            untracked(() => {
                // Never overwrite what the user is typing, or notes that are still being
                // saved or that failed to save.
                const status = this.saveStatus();
                if (open && !this.notesDirty && status !== 'saving' && status !== 'failed') {
                    this.localNotes = notes;
                }
            });
        });
        if (isPlatformBrowser(this.platformId)) {
            document.addEventListener('click', this.boundCloseMenu);
            ensureQuillPlugins();
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
        if (isPlatformBrowser(this.platformId)) {
            document.removeEventListener('click', this.boundCloseMenu);
        }
        this.notesSubscription?.unsubscribe();
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
        // If the topic goes away while full screen is open, the section was moved to <body>
        // and Angular would leave it behind, so clean it up.
        this.teardownFullscreen(false);
    }

    // ── Notes full screen ─────────────────────────────

    /**
     * Opens the notes section (header with save status + editor) over the whole screen.
     *
     * The same element is moved to <body> instead of being re-created, so the editor keeps its
     * text, cursor and autosave. Moving it also avoids `position: fixed` being trapped by a
     * transformed or clipped parent (the topic panel sits inside an expand animation).
     */
    openNotesFullscreen(event?: Event) {
        event?.stopPropagation();
        const el = this.notesWrap()?.nativeElement;
        if (!el || !isPlatformBrowser(this.platformId) || this.notesFullscreen()) return;

        this.fsPlaceholder = document.createComment('notes-fullscreen');
        el.parentNode?.insertBefore(this.fsPlaceholder, el);
        document.body.appendChild(el);
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', this.boundFsKeydown, true);

        this.lastEscAt = 0;
        this.fsClosing = false;
        this.notesFullscreen.set(true);
    }

    /** Closes full screen with a short fade-out, then puts the section back in place. */
    closeNotesFullscreen() {
        const el = this.notesWrap()?.nativeElement;
        if (!el || !this.notesFullscreen() || this.fsClosing) return;
        this.fsClosing = true;
        this.escHint.set(false);
        el.classList.add('notes-fs-closing');

        // Save anything typed but not yet saved, without waiting for the autosave timer.
        if (this.notesDirty) this.performNoteSave();

        this.closeTimeout = setTimeout(() => {
            this.teardownFullscreen(true);
            // The Full screen button is created again once the signal flips, so focus it after render.
            setTimeout(() => this.fsBtn()?.nativeElement.focus(), 0);
        }, this.CLOSE_ANIM_MS);
    }

    /** Puts the section back where it came from (or drops it when the component is going away). */
    private teardownFullscreen(restore: boolean) {
        if (this.closeTimeout) clearTimeout(this.closeTimeout);
        if (this.escHintTimeout) clearTimeout(this.escHintTimeout);
        if (!this.fsPlaceholder) return;

        const el = this.notesWrap()?.nativeElement;
        if (el) {
            el.classList.remove('notes-fs-closing');
            if (restore && this.fsPlaceholder.parentNode) {
                this.fsPlaceholder.parentNode.insertBefore(el, this.fsPlaceholder);
            } else {
                el.remove();
            }
        }
        this.fsPlaceholder.remove();
        this.fsPlaceholder = undefined;

        if (isPlatformBrowser(this.platformId)) {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', this.boundFsKeydown, true);
        }
        this.fsClosing = false;
        this.escHint.set(false);
        if (restore) this.notesFullscreen.set(false);
    }

    /** Esc twice within 1.5 s closes. A single Esc only shows a hint, so it cannot close by accident. */
    private onFullscreenKeydown(e: KeyboardEvent) {
        if (e.key !== 'Escape' || !this.notesFullscreen() || this.fsClosing) return;
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        if (now - this.lastEscAt <= this.ESC_WINDOW_MS) {
            this.lastEscAt = 0;
            this.closeNotesFullscreen();
            return;
        }
        this.lastEscAt = now;
        this.escHint.set(true);
        if (this.escHintTimeout) clearTimeout(this.escHintTimeout);
        this.escHintTimeout = setTimeout(() => this.escHint.set(false), this.ESC_WINDOW_MS);
    }

    /** While moved to <body>, clicks no longer reach the component host, so open links here. */
    onNotesWrapClick(event: MouseEvent) {
        if (this.notesFullscreen()) this.onLinkClick(event);
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
            event.preventDefault();
            event.stopPropagation();
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

    /** Saves the notes again after a failure (the "Not saved. Retry" button). */
    retryNoteSave(event?: Event) {
        event?.preventDefault();
        event?.stopPropagation();
        this.notesDirty = true;
        this.performNoteSave();
    }

    private performNoteSave() {
        if (!this.notesDirty) return;
        const seq = ++this.saveSeq;
        this.saveStatus.set('saving');
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
        this.notesDirty = false;

        this.progressChanged.emit({
            topicId: this.topic().id,
            completed: this.topic().completed,
            notes: this.localNotes,
            onResult: saved => this.onNoteSaveResult(seq, saved)
        });
    }

    /** The real answer from the database arrives here. */
    private onNoteSaveResult(seq: number, saved: boolean) {
        // A newer save has started, or the user typed more since: that one decides the label.
        if (seq !== this.saveSeq || this.notesDirty) return;

        if (!saved) {
            this.saveStatus.set('failed'); // stays until a save works
            return;
        }

        this.saveStatus.set('saved');
        if (this.savedTimeout) clearTimeout(this.savedTimeout);
        this.savedTimeout = setTimeout(() => this.saveStatus.set('idle'), 2000);
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