import { TestBed } from '@angular/core/testing';
import { PendingDeleteService } from './pending-delete.service';
import { ToastService } from './toast.service';

describe('PendingDeleteService', () => {
    let service: PendingDeleteService;
    let toast: ToastService;

    const options = (overrides: Record<string, unknown> = {}) => ({
        key: 'topic:1',
        message: '"Algebra" deleted.',
        commit: vi.fn().mockResolvedValue(undefined),
        undo: vi.fn(),
        onCommitted: vi.fn(),
        failMessage: 'Could not delete.',
        ...overrides
    });

    const pressUndo = () => {
        const undoToast = toast.toasts().find(t => t.action?.label === 'Undo');
        expect(undoToast).toBeTruthy();
        undoToast!.action!.handler();
    };

    beforeEach(() => {
        vi.useFakeTimers();
        TestBed.configureTestingModule({});
        service = TestBed.inject(PendingDeleteService);
        toast = TestBed.inject(ToastService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('hides nothing by itself but shows an Undo toast and does not delete yet', () => {
        const o = options();
        service.schedule(o);

        expect(o.commit).not.toHaveBeenCalled();
        expect(service.isPending('topic:1')).toBe(true);
        const t = toast.toasts();
        expect(t).toHaveLength(1);
        expect(t[0].message).toBe('"Algebra" deleted.');
        expect(t[0].action?.label).toBe('Undo');
    });

    it('does the real delete once, after the undo window', async () => {
        const o = options();
        service.schedule(o);

        await vi.advanceTimersByTimeAsync(7999);
        expect(o.commit).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(o.commit).toHaveBeenCalledTimes(1);
        expect(o.onCommitted).toHaveBeenCalledTimes(1);
        expect(o.undo).not.toHaveBeenCalled();
        expect(service.isPending('topic:1')).toBe(false);
        expect(toast.toasts()).toHaveLength(0);
    });

    it('Undo puts the item back and the real delete never runs', async () => {
        const o = options();
        service.schedule(o);

        pressUndo();

        expect(o.undo).toHaveBeenCalledTimes(1);
        expect(service.isPending('topic:1')).toBe(false);
        expect(toast.toasts()).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(o.commit).not.toHaveBeenCalled();
    });

    it('Undo does nothing once the real delete has started', async () => {
        let finish!: () => void;
        const o = options({ commit: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })) });
        service.schedule(o);
        const staleHandler = toast.toasts()[0].action!.handler;

        await vi.advanceTimersByTimeAsync(8000);
        expect(o.commit).toHaveBeenCalledTimes(1);

        staleHandler();
        expect(o.undo).not.toHaveBeenCalled();

        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(o.undo).not.toHaveBeenCalled();
    });

    it('keeps reporting the item as pending while the real delete is in flight', async () => {
        let finish!: () => void;
        const o = options({ commit: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })) });
        service.schedule(o);

        await vi.advanceTimersByTimeAsync(8000);
        expect(service.isPending('topic:1')).toBe(true);

        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(service.isPending('topic:1')).toBe(false);
    });

    it('puts the item back and shows an error if the real delete fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        const o = options({ commit: vi.fn().mockRejectedValue(new Error('network down')) });
        service.schedule(o);

        await vi.advanceTimersByTimeAsync(8000);

        expect(o.undo).toHaveBeenCalledTimes(1);
        expect(o.onCommitted).not.toHaveBeenCalled();
        expect(service.isPending('topic:1')).toBe(false);
        const t = toast.toasts();
        expect(t).toHaveLength(1);
        expect(t[0].type).toBe('error');
        expect(t[0].message).toBe('Could not delete.');
    });

    it('ignores a second schedule for the same item', async () => {
        const first = options();
        const second = options();
        service.schedule(first);
        service.schedule(second);

        expect(toast.toasts()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(8000);
        expect(first.commit).toHaveBeenCalledTimes(1);
        expect(second.commit).not.toHaveBeenCalled();
    });

    it('treats different items independently', async () => {
        const a = options({ key: 'topic:a' });
        const b = options({ key: 'topic:b' });
        service.schedule(a);
        service.schedule(b);

        const aToast = toast.toasts()[0];
        aToast.action!.handler();

        expect(a.undo).toHaveBeenCalled();
        expect(b.undo).not.toHaveBeenCalled();
        expect(service.isPending('topic:b')).toBe(true);

        await vi.advanceTimersByTimeAsync(8000);
        expect(a.commit).not.toHaveBeenCalled();
        expect(b.commit).toHaveBeenCalledTimes(1);
    });

    it('runs every waiting delete right away when the page is closing (flushAll)', async () => {
        const a = options({ key: 'subject:a' });
        const b = options({ key: 'media:b' });
        service.schedule(a);
        service.schedule(b);

        service.flushAll();
        await vi.advanceTimersByTimeAsync(0);

        expect(a.commit).toHaveBeenCalledTimes(1);
        expect(b.commit).toHaveBeenCalledTimes(1);
        expect(toast.toasts()).toHaveLength(0);

        // the timers were cleared, so nothing runs a second time
        await vi.advanceTimersByTimeAsync(60_000);
        expect(a.commit).toHaveBeenCalledTimes(1);
        expect(b.commit).toHaveBeenCalledTimes(1);
    });

    it('honours a custom undo window', async () => {
        const o = options({ delayMs: 2000 });
        service.schedule(o);

        await vi.advanceTimersByTimeAsync(1999);
        expect(o.commit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(o.commit).toHaveBeenCalledTimes(1);
    });
});

describe('ToastService actions', () => {
    let toast: ToastService;

    beforeEach(() => {
        vi.useFakeTimers();
        TestBed.configureTestingModule({});
        toast = TestBed.inject(ToastService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns an id that can dismiss the toast early', () => {
        const id = toast.show('hello', 'info', 5000);
        expect(toast.toasts()).toHaveLength(1);
        toast.dismiss(id);
        expect(toast.toasts()).toHaveLength(0);
    });

    it('keeps an error toast with an action on screen longer than a plain one', () => {
        toast.error('plain');
        toast.error('with retry', { label: 'Retry', handler: () => { } });

        vi.advanceTimersByTime(4000);
        expect(toast.toasts().map(t => t.message)).toEqual(['with retry']);

        vi.advanceTimersByTime(4000);
        expect(toast.toasts()).toHaveLength(0);
    });
});
