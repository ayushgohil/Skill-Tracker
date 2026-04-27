// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TopicWithProgress, Depth } from '../../core/models';
import { PomodoroService } from '../../core/services/pomodoro.service';

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

@Component({
    selector: 'app-topic-item',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './topic-item.component.html'
})
export class TopicItemComponent {
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

    editing = signal(false);
    editTitle = '';
    editDepth: Depth = 'medium';

    addingSubtopic = signal(false);
    newSubtopicTitle = '';

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
    constructor(public pomodoro: PomodoroService) {
        effect(() => {
            if (this.isOpen()) {
                this.localNotes = this.topic().notes;
                this.notesDirty = false;
            }
        });
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

    onNotesInput() { this.notesDirty = true; }

    onNotesBlur() {
        if (this.notesDirty) {
            this.progressChanged.emit({
                topicId: this.topic().id,
                completed: this.topic().completed,
                notes: this.localNotes
            });
            this.notesDirty = false;
        }
    }

    startEdit(event: Event) {
        event.stopPropagation();
        this.editTitle = this.topic().title;
        this.editDepth = this.topic().depth;
        this.editing.set(true);
    }

    cancelEdit() { this.editing.set(false); }

    saveEdit(event?: Event) {
        event?.stopPropagation();
        if (!this.editTitle.trim()) return;
        this.topicEdited.emit({
            topicId: this.topic().id,
            title: this.editTitle.trim(),
            depth: this.editDepth
        });
        this.editing.set(false);
    }

    onDelete(event: Event) {
        event.stopPropagation();
        this.topicDeleted.emit(this.topic().id);
    }

    // ── Subtopic actions ──────────────────────────────
    onSubtopicCheck(subtopicId: string, currentCompleted: boolean) {
        this.subtopicToggled.emit({
            subtopicId,
            completed: !currentCompleted,
            topicId: this.topic().id
        });
    }

    onSubtopicDelete(event: Event, subtopicId: string) {
        event.stopPropagation();
        this.subtopicDeleted.emit({
            subtopicId,
            topicId: this.topic().id
        });
    }

    submitSubtopic() {
        if (!this.newSubtopicTitle.trim()) return;
        this.subtopicAdded.emit({
            topicId: this.topic().id,
            title: this.newSubtopicTitle.trim()
        });
        this.newSubtopicTitle = '';
        this.addingSubtopic.set(false);
    }

    cancelAddSubtopic() {
        this.newSubtopicTitle = '';
        this.addingSubtopic.set(false);
    }
}