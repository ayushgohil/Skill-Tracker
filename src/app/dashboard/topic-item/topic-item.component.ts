// src/app/dashboard/topic-item/topic-item.component.ts
import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TopicWithProgress } from '../../core/services/topics.service';

export interface TopicChangeEvent {
    topicId: string;
    completed: boolean;
    notes: string;
}

@Component({
    selector: 'app-topic-item',
    standalone: true,
    imports: [FormsModule],
    template: `
    <div
      class="group bg-zinc-900 border rounded-xl transition-all duration-200"
      [class.border-zinc-700]="!topic.completed"
      [class.border-emerald-500]="topic.completed"
      [class.border-opacity-40]="topic.completed"
    >
      <!-- Main Row -->
      <div class="flex items-center gap-3 px-4 py-3 cursor-pointer" (click)="toggleExpand()">

        <!-- Checkbox -->
        <button
          (click)="toggleComplete($event)"
          class="flex-shrink-0 w-5 h-5 rounded border-2 transition-all duration-150 flex items-center justify-center"
          [class.border-zinc-600]="!topic.completed"
          [class.border-emerald-500]="topic.completed"
          [class.bg-emerald-500]="topic.completed"
        >
          @if (topic.completed) {
            <svg class="w-3 h-3 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          }
        </button>

        <!-- Title -->
        <span
          class="flex-1 text-sm font-medium transition-colors"
          [class.text-white]="!topic.completed"
          [class.text-zinc-500]="topic.completed"
          [class.line-through]="topic.completed"
        >
          {{ topic.title }}
        </span>

        <!-- Depth badge -->
        <span
          class="text-xs px-2 py-0.5 rounded-full font-medium"
          [class.bg-zinc-800]="topic.depth === 'shallow'"
          [class.text-zinc-400]="topic.depth === 'shallow'"
          [class.bg-amber-500]="topic.depth === 'medium'"
          [class.bg-opacity-20]="topic.depth === 'medium'"
          [class.text-amber-400]="topic.depth === 'medium'"
          [class.bg-red-500]="topic.depth === 'deep'"
          [class.text-red-400]="topic.depth === 'deep'"
        >
          {{ topic.depth }}
        </span>

        <!-- Notes indicator -->
        @if (topic.notes) {
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></div>
        }

        <!-- Expand arrow -->
        <svg
          class="w-4 h-4 text-zinc-600 transition-transform duration-200 flex-shrink-0"
          [class.rotate-180]="expanded()"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <!-- Expanded Notes Panel -->
      @if (expanded()) {
        <div class="px-4 pb-4 border-t border-zinc-800 pt-3" (click)="$event.stopPropagation()">
          <label class="text-zinc-500 text-xs block mb-2">Notes, links, thoughts</label>
          <textarea
            [(ngModel)]="localNotes"
            placeholder="Paste links, write what you learned, open questions..."
            rows="4"
            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600 resize-none"
          ></textarea>
          <div class="flex justify-end mt-2">
            <button
              (click)="saveNotes()"
              [disabled]="saving()"
              class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {{ saving() ? 'Saving...' : 'Save notes' }}
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export class TopicItemComponent {
    @Input({ required: true }) topic!: TopicWithProgress;
    @Output() topicChanged = new EventEmitter<TopicChangeEvent>();

    expanded = signal(false);
    saving = signal(false);
    localNotes = '';

    toggleExpand() {
        this.expanded.update(v => !v);
        if (this.expanded()) {
            this.localNotes = this.topic.notes;
        }
    }

    toggleComplete(event: Event) {
        event.stopPropagation();
        this.topicChanged.emit({
            topicId: this.topic.id,
            completed: !this.topic.completed,
            notes: this.topic.notes
        });
    }

    saveNotes() {
        this.saving.set(true);
        this.topicChanged.emit({
            topicId: this.topic.id,
            completed: this.topic.completed,
            notes: this.localNotes
        });
        setTimeout(() => this.saving.set(false), 500);
    }
}