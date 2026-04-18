// src/app/core/services/toast.service.ts
import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    toasts = signal<Toast[]>([]);
    private counter = 0;

    show(message: string, type: ToastType = 'success', duration = 3000) {
        const id = ++this.counter;
        this.toasts.update(t => [...t, { id, message, type }]);
        setTimeout(() => this.dismiss(id), duration);
    }

    dismiss(id: number) {
        this.toasts.update(t => t.filter(toast => toast.id !== id));
    }

    success(message: string) { this.show(message, 'success'); }
    error(message: string) { this.show(message, 'error', 4000); }
    info(message: string) { this.show(message, 'info'); }
}