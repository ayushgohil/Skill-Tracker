// src/app/core/services/toast.service.ts
import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

/** Optional button shown inside a toast (for example "Undo" or "Retry"). */
export interface ToastAction {
    label: string;
    handler: () => void;
}

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
    action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    toasts = signal<Toast[]>([]);
    private counter = 0;

    /** Shows a toast and returns its id so it can be dismissed early. */
    show(message: string, type: ToastType = 'success', duration = 3000, action?: ToastAction): number {
        const id = ++this.counter;
        this.toasts.update(t => [...t, { id, message, type, action }]);
        setTimeout(() => this.dismiss(id), duration);
        return id;
    }

    dismiss(id: number) {
        this.toasts.update(t => t.filter(toast => toast.id !== id));
    }

    success(message: string) { this.show(message, 'success'); }
    error(message: string, action?: ToastAction) { this.show(message, 'error', action ? 8000 : 4000, action); }
    info(message: string) { this.show(message, 'info'); }
}
