// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, Input, Output, EventEmitter, signal, computed, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TopicWithProgress, Depth } from '../../core/models';

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
export class TopicItemComponent implements OnChanges {
    @Input({ required: true }) topic!: TopicWithProgress;
    @Input() isOpen = false;
    @Output() toggleOpen = new EventEmitter<string>();
    @Output() progressChanged = new EventEmitter<ProgressChange>();
    @Output() topicEdited = new EventEmitter<TopicEditEvent>();
    @Output() topicDeleted = new EventEmitter<string>();
    @Output() subtopicToggled = new EventEmitter<SubtopicToggleEvent>();
    @Output() subtopicAdded = new EventEmitter<SubtopicAddEvent>();
    @Output() subtopicDeleted = new EventEmitter<SubtopicDeleteEvent>();

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

    // ── Subtopic computed helpers ──────────────────────
    hasSubtopics = computed(() => this.topic?.subtopics?.length > 0);
    allSubtopicsComplete = computed(() =>
        this.topic?.subtopics?.length > 0 && this.topic.subtopics.every(s => s.completed)
    );
    subtopicCompletedCount = computed(() =>
        this.topic?.subtopics?.filter(s => s.completed).length ?? 0
    );
    subtopicTotalCount = computed(() =>
        this.topic?.subtopics?.length ?? 0
    );
    isTopicChecked = computed(() =>
        this.topic?.completed || this.allSubtopicsComplete()
    );

    ngOnChanges() {
        if (this.isOpen) {
            this.localNotes = this.topic.notes;
            this.notesDirty = false;
        }
    }

    onToggle() {
        if (!this.editing()) this.toggleOpen.emit(this.topic.id);
    }

    onCheck(event: Event) {
        event.stopPropagation();
        // Disable manual toggle when subtopics exist
        if (this.hasSubtopics()) return;
        this.progressChanged.emit({
            topicId: this.topic.id,
            completed: !this.topic.completed,
            notes: this.topic.notes
        });
    }

    onNotesInput() { this.notesDirty = true; }

    onNotesBlur() {
        if (this.notesDirty) {
            this.progressChanged.emit({
                topicId: this.topic.id,
                completed: this.topic.completed,
                notes: this.localNotes
            });
            this.notesDirty = false;
        }
    }

    startEdit(event: Event) {
        event.stopPropagation();
        this.editTitle = this.topic.title;
        this.editDepth = this.topic.depth;
        this.editing.set(true);
    }

    cancelEdit() { this.editing.set(false); }

    saveEdit(event?: Event) {
        event?.stopPropagation();
        if (!this.editTitle.trim()) return;
        this.topicEdited.emit({ topicId: this.topic.id, title: this.editTitle.trim(), depth: this.editDepth });
        this.editing.set(false);
    }

    onDelete(event: Event) {
        event.stopPropagation();
        this.topicDeleted.emit(this.topic.id);
    }

    // ── Subtopic actions ──────────────────────────────
    onSubtopicCheck(subtopicId: string, currentCompleted: boolean) {
        this.subtopicToggled.emit({
            subtopicId,
            completed: !currentCompleted,
            topicId: this.topic.id
        });
    }

    onSubtopicDelete(event: Event, subtopicId: string) {
        event.stopPropagation();
        this.subtopicDeleted.emit({
            subtopicId,
            topicId: this.topic.id
        });
    }

    submitSubtopic() {
        if (!this.newSubtopicTitle.trim()) return;
        this.subtopicAdded.emit({
            topicId: this.topic.id,
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