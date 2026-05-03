// src/app/shared/toast/toast.component.ts
import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    template: `
    <div class="fixed top-8 right-6 z-[300] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-center gap-4 px-6 py-4 rounded-[28px] text-sm font-bold shadow-2xl pointer-events-auto animate-bounce-in border border-white"
          [class.bg-white]="toast.type === 'info' || toast.type === 'success' || toast.type === 'error'"
          [class.text-[#1a1b2b]]="true"
        >
          <!-- Icon -->
          <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
               [class.bg-green-50]="toast.type === 'success'"
               [class.text-green-500]="toast.type === 'success'"
               [class.bg-red-50]="toast.type === 'error'"
               [class.text-red-500]="toast.type === 'error'"
               [class.bg-[#7d5cf6]/5]="toast.type === 'info'"
               [class.text-[#7d5cf6]]="toast.type === 'info'">
               
               @if (toast.type === 'success') {
                 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                 </svg>
               }
               @if (toast.type === 'error') {
                 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                 </svg>
               }
               @if (toast.type === 'info') {
                 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                 </svg>
               }
          </div>

          <span class="flex-1 tracking-tight">{{ toast.message }}</span>

          <button (click)="toastService.dismiss(toast.id)"
            class="w-8 h-8 rounded-full bg-[#f3f4f9] flex items-center justify-center text-gray-300 hover:text-gray-500 transition-all">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
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