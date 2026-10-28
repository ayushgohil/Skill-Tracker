// src/app/core/services/pending-delete.service.ts
import { Injectable } from '@angular/core';
import { ToastService } from './toast.service';

export interface PendingDeleteOptions {
    /** Unique per item, for example "topic:<id>". Used to avoid double-scheduling and to filter reloads. */
    key: string;
    /** Shown in the toast next to the Undo button, for example `"Algebra" deleted.` */
    message: string;
    /** The real delete. Only runs once the undo window has passed. */
    commit: () => Promise<void>;
    /** Puts the item back on screen. Runs on Undo, and if the real delete fails. */
    undo: () => void;
    /** Shown if the real delete fails (the item is put back on screen as well). */
    failMessage: string;
    /** Runs after the real delete succeeded (clean-up only). */
    onCommitted?: () => void;
    /** How long Undo stays available. Default 8 seconds. */
    delayMs?: number;
}

interface PendingItem extends PendingDeleteOptions {
    timer: ReturnType<typeof setTimeout>;
    toastId: number;
}

/**
 * Gives deletes an "Undo" window.
 *
 * The item disappears from the screen straight away, but the real delete only runs after
 * a few seconds. Until then nothing has been deleted, so Undo simply puts the item back
 * on screen with no database work at all.
 *
 * If the page is closed during the window, the pending deletes are sent right away on a
 * best-effort basis. If the browser cancels them, the item simply still exists next time,
 * which is the safe way to fail.
 */
@Injectable({ providedIn: 'root' })
export class PendingDeleteService {
    private static readonly DEFAULT_DELAY_MS = 8000;

    private pending = new Map<string, PendingItem>();
    private committing = new Set<string>();

    constructor(private toast: ToastService) {
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', () => this.flushAll());
        }
    }

    /** True while the item is waiting for its undo window to end, or its delete is in flight. */
    isPending(key: string): boolean {
        return this.pending.has(key) || this.committing.has(key);
    }

    schedule(options: PendingDeleteOptions): void {
        if (this.isPending(options.key)) return;

        const delay = options.delayMs ?? PendingDeleteService.DEFAULT_DELAY_MS;
        const toastId = this.toast.show(options.message, 'info', delay, {
            label: 'Undo',
            handler: () => this.cancel(options.key)
        });
        const timer = setTimeout(() => { void this.run(options.key); }, delay);

        this.pending.set(options.key, { ...options, timer, toastId });
    }

    /** Undo: forget the pending delete and put the item back on screen. */
    private cancel(key: string): void {
        const item = this.pending.get(key);
        if (!item) return; // too late, the real delete has already started
        clearTimeout(item.timer);
        this.pending.delete(key);
        this.toast.dismiss(item.toastId);
        item.undo();
    }

    private async run(key: string): Promise<void> {
        const item = this.pending.get(key);
        if (!item) return;

        clearTimeout(item.timer);
        this.pending.delete(key);
        this.committing.add(key);
        this.toast.dismiss(item.toastId);

        try {
            await item.commit();
            item.onCommitted?.();
        } catch (err) {
            console.error(`Delete failed for ${key}:`, err);
            item.undo();
            this.toast.error(item.failMessage);
        } finally {
            this.committing.delete(key);
        }
    }

    /** Runs every waiting delete now (used when the page is being closed). */
    flushAll(): void {
        for (const key of Array.from(this.pending.keys())) {
            void this.run(key);
        }
    }
}
