import { TestBed } from '@angular/core/testing';
import { PomodoroService } from './pomodoro.service';

const KEY = 'skilltracker.pomodoro.v1';
const MINUTE = 60_000;

describe('PomodoroService: surviving a page refresh', () => {
    let service: PomodoroService;

    /** Simulates a page refresh: a brand new service that reads whatever was saved. */
    const refresh = () => {
        TestBed.resetTestingModule();
        service = TestBed.inject(PomodoroService);
        return service;
    };

    const saved = () => {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    };

    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
        vi.stubGlobal('Audio', class { play() { return Promise.resolve(); } });
        TestBed.configureTestingModule({});
        service = TestBed.inject(PomodoroService);
    });

    afterEach(() => {
        service.stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('starts idle with nothing saved', () => {
        expect(service.state()).toBe('idle');
        expect(saved()).toBeNull();
    });

    it('saves a running focus session when it starts', () => {
        service.startSession('topic-1', 'Algebra');

        const s = saved();
        expect(s.state).toBe('running');
        expect(s.topicId).toBe('topic-1');
        expect(s.topicTitle).toBe('Algebra');
        expect(s.endTime).toBe(Date.now() + 25 * MINUTE);
        expect(s.remaining).toBeNull();
    });

    it('keeps counting down after a refresh', async () => {
        service.startSession('topic-1', 'Algebra');
        await vi.advanceTimersByTimeAsync(10 * MINUTE);

        // refresh 10 minutes in
        const after = refresh();
        expect(after.state()).toBe('running');
        expect(after.activeTopicId()).toBe('topic-1');
        expect(after.activeTopicTitle()).toBe('Algebra');
        expect(after.isVisible()).toBe(true);
        expect(after.isPaused()).toBe(false);
        expect(after.timeRemaining()).toBe(15 * 60);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(after.timeRemaining()).toBe(15 * 60 - 5);
    });

    it('counts the time that passed while the page was closed', () => {
        service.startSession('topic-1', 'Algebra');
        vi.setSystemTime(Date.now() + 20 * MINUTE); // closed for 20 minutes

        const after = refresh();
        expect(after.state()).toBe('running');
        expect(after.timeRemaining()).toBe(5 * 60);
    });

    it('comes back paused, with the same time left, however long it was closed', async () => {
        service.startSession('topic-1', 'Algebra');
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        service.togglePause();
        const left = service.timeRemaining();
        expect(saved().remaining).toBe(left);
        expect(saved().endTime).toBeNull();

        vi.setSystemTime(Date.now() + 3 * 60 * MINUTE); // closed for 3 hours
        const after = refresh();

        expect(after.isPaused()).toBe(true);
        expect(after.timeRemaining()).toBe(left);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(after.timeRemaining()).toBe(left); // still paused

        after.togglePause(); // resume
        await vi.advanceTimersByTimeAsync(10_000);
        expect(after.timeRemaining()).toBe(left - 10);
    });

    it('offers the break, quietly, if the focus time ended while the page was closed', () => {
        const play = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('Audio', class { play = play; });
        service.startSession('topic-1', 'Algebra');
        vi.setSystemTime(Date.now() + 40 * MINUTE);

        const after = refresh();
        expect(after.state()).toBe('running');
        expect(after.timeRemaining()).toBe(0);
        expect(after.isBreakWaiting()).toBe(true);
        expect(after.isPaused()).toBe(true);
        expect(play).not.toHaveBeenCalled(); // no alarm for something that already happened
    });

    it('remembers a finished focus session that is waiting for the break button', async () => {
        service.startSession('topic-1', 'Algebra');
        await vi.advanceTimersByTimeAsync(25 * MINUTE + 1000);
        expect(service.isBreakWaiting()).toBe(true);

        const after = refresh();
        expect(after.isBreakWaiting()).toBe(true);
        expect(after.timeRemaining()).toBe(0);
        expect(after.activeTopicId()).toBe('topic-1');

        after.startBreak();
        expect(after.state()).toBe('break');
        expect(after.timeRemaining()).toBe(5 * 60);
    });

    it('keeps a break going after a refresh', async () => {
        service.startSession('topic-1', 'Algebra');
        await vi.advanceTimersByTimeAsync(25 * MINUTE + 1000);
        service.startBreak();
        await vi.advanceTimersByTimeAsync(2 * MINUTE);

        const after = refresh();
        expect(after.state()).toBe('break');
        expect(after.timeRemaining()).toBe(3 * 60);
    });

    it('forgets a break that ended while the page was closed', async () => {
        service.startSession('topic-1', 'Algebra');
        await vi.advanceTimersByTimeAsync(25 * MINUTE + 1000);
        service.startBreak();
        vi.setSystemTime(Date.now() + 10 * MINUTE);

        const after = refresh();
        expect(after.state()).toBe('idle');
        expect(after.isVisible()).toBe(false);
        expect(saved()).toBeNull();
    });

    it('stop() forgets the saved session', () => {
        service.startSession('topic-1', 'Algebra');
        expect(saved()).not.toBeNull();

        service.stop();
        expect(saved()).toBeNull();
        expect(refresh().state()).toBe('idle');
    });

    it('keeps a hidden timer hidden after a refresh, and a shown one shown', () => {
        service.startSession('topic-1', 'Algebra');
        service.closeWidget();
        expect(refresh().isVisible()).toBe(false);
        expect(refresh().state()).toBe('running');

        service.openWidget();
        expect(refresh().isVisible()).toBe(true);
    });

    it('does not open in full screen after a refresh (browsers need a click for that)', () => {
        service.startSession('topic-1', 'Algebra');
        expect(service.isFullScreen()).toBe(true);
        expect(refresh().isFullScreen()).toBe(false);
    });

    it('forgets a session that is more than 12 hours old', () => {
        service.startSession('topic-1', 'Algebra');
        service.togglePause();
        vi.setSystemTime(Date.now() + 13 * 60 * MINUTE);

        const after = refresh();
        expect(after.state()).toBe('idle');
        expect(saved()).toBeNull();
    });

    describe('ignores damaged saved data without crashing', () => {
        const cases: Record<string, string> = {
            'not JSON': '{oops',
            'a number': '5',
            'null': 'null',
            'wrong version': JSON.stringify({ version: 2, state: 'running', savedAt: Date.now(), endTime: Date.now() + MINUTE, remaining: null }),
            'unknown state': JSON.stringify({ version: 1, state: 'dancing', savedAt: Date.now(), endTime: Date.now() + MINUTE, remaining: null }),
            'text instead of times': JSON.stringify({ version: 1, state: 'running', savedAt: Date.now(), endTime: 'soon', remaining: null }),
            'no times at all': JSON.stringify({ version: 1, state: 'running', savedAt: Date.now(), endTime: null, remaining: null })
        };

        for (const [name, raw] of Object.entries(cases)) {
            it(name, () => {
                localStorage.setItem(KEY, raw);
                const after = refresh();
                expect(after.state()).toBe('idle');
                expect(after.isVisible()).toBe(false);
            });
        }
    });

    it('still works when the browser will not let it save anything', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        expect(() => service.startSession('topic-1', 'Algebra')).not.toThrow();
        expect(service.state()).toBe('running');
        setItem.mockRestore();
    });
});
