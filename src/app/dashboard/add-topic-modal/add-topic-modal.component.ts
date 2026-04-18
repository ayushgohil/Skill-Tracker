// src/app/dashboard/add-topic-modal/add-topic-modal.component.ts
import { Component, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface NewTopicData {
    title: string;
    category: 'Angular' | 'Backend';
    depth: 'shallow' | 'medium' | 'deep';
}

@Component({
    selector: 'app-add-topic-modal',
    standalone: true,
    imports: [FormsModule],
    template: `
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4"
      (click)="cancel.emit()"
    >
      <!-- Modal -->
      <div
        class="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md"
        (click)="$event.stopPropagation()"
      >
        <h3 class="text-white font-semibold text-lg mb-5">Add new topic</h3>

        <div class="space-y-4">
          <div>
            <label class="text-zinc-400 text-sm block mb-1.5">Topic title</label>
            <input
              [(ngModel)]="title"
              type="text"
              placeholder="e.g. Change Detection"
              class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
            />
          </div>

          <div>
            <label class="text-zinc-400 text-sm block mb-1.5">Category</label>
            <select
              [(ngModel)]="category"
              class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="Angular">Angular</option>
              <option value="Backend">Backend</option>
            </select>
          </div>

          <div>
            <label class="text-zinc-400 text-sm block mb-1.5">Depth to learn</label>
            <select
              [(ngModel)]="depth"
              class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="shallow">Shallow — know what it is</option>
              <option value="medium">Medium — understand how it works</option>
              <option value="deep">Deep — internalize it</option>
            </select>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            (click)="cancel.emit()"
            class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            (click)="submit()"
            [disabled]="!title.trim()"
            class="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 rounded-lg py-2.5 text-sm font-semibold transition-colors"
          >
            Add topic
          </button>
        </div>
      </div>
    </div>
  `
})
export class AddTopicModalComponent {
    @Output() add = new EventEmitter<NewTopicData>();
    @Output() cancel = new EventEmitter<void>();

    title = '';
    category: 'Angular' | 'Backend' = 'Angular';
    depth: 'shallow' | 'medium' | 'deep' = 'medium';

    submit() {
        if (!this.title.trim()) return;
        this.add.emit({ title: this.title.trim(), category: this.category, depth: this.depth });
    }
}