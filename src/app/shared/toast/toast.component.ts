// src/app/shared/toast/toast.component.ts
import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    template: `
    <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-xl pointer-events-auto animate-slide-up"
          [class.bg-zinc-800]="toast.type === 'info'"
          [class.text-white]="toast.type === 'info'"
          [class.border]="true"
          [class.border-zinc-700]="toast.type === 'info'"
          [class.bg-emerald-500]="toast.type === 'success'"
          [class.text-zinc-950]="toast.type === 'success'"
          [class.border-emerald-400]="toast.type === 'success'"
          [class.bg-red-500]="toast.type === 'error'"
          [class.text-white]="toast.type === 'error'"
          [class.border-red-400]="toast.type === 'error'"
        >
          <!-- Icon -->
          @if (toast.type === 'success') {
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          }
          @if (toast.type === 'error') {
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          }
          @if (toast.type === 'info') {
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          }

          <span>{{ toast.message }}</span>

          <button (click)="toastService.dismiss(toast.id)"
            class="ml-2 opacity-60 hover:opacity-100 transition-opacity">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      }
    </div>
  `
})
export class ToastComponent {
    toastService = inject(ToastService);
}