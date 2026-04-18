// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, Input, Output, EventEmitter, signal, OnChanges } from '@angular/core';
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

    localNotes = '';
    notesDirty = false;

    editing = signal(false);
    editTitle = '';
    editDepth: Depth = 'medium';

    readonly depthConfig: Record<Depth, { label: string; classes: string }> = {
        shallow: { label: 'Shallow', classes: 'bg-zinc-800 text-zinc-400' },
        medium: { label: 'Medium', classes: 'bg-amber-500/20 text-amber-400' },
        deep: { label: 'Deep', classes: 'bg-red-500/20 text-red-400' }
    };

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
}