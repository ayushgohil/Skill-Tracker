import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { SubjectDetailComponent } from './subject-detail.component';
import { SubjectsService } from '../../core/services/subjects.service';
import { TopicsService } from '../../core/services/topics.service';
import { SubtopicsService } from '../../core/services/subtopics.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { TopicWithProgress } from '../../core/models';

/**
 * Tests the subject page's logic only (no template is rendered): what happens to the
 * on-screen state when a save fails, when Retry is pressed, and when a delete is undone.
 */
describe('SubjectDetailComponent: failed saves and undo', () => {
    let component: SubjectDetailComponent;
    let toast: ToastService;
    let topicsService: Record<string, ReturnType<typeof vi.fn>>;
    let subtopicsService: Record<string, ReturnType<typeof vi.fn>>;

    const subtopic = (id: string, completed = false) =>
        ({ id, user_id: 'u', topic_id: 't1', title: `Sub ${id}`, completed, notes: '', order: 0, created_at: '' });

    const topic = (id: string, extra: Partial<TopicWithProgress> = {}): TopicWithProgress => ({
        id, user_id: 'u', subject_id: 's1', title: `Topic ${id}`, depth: 'medium', starred: false,
        created_at: '', completed: false, notes: '', subtopics: [], ...extra
    });

    const errorToast = () => toast.toasts().find(t => t.type === 'error');
    const undoToast = () => toast.toasts().find(t => t.action?.label === 'Undo');
    const current = (id: string) => component.topics().find(t => t.id === id)!;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => { });

        topicsService = {
            upsertProgress: vi.fn().mockResolvedValue(undefined),
            updateTopic: vi.fn().mockResolvedValue(undefined),
            addTopic: vi.fn(),
            updateTopicsOrder: vi.fn().mockResolvedValue(undefined),
            deleteTopic: vi.fn().mockResolvedValue(undefined)
        };
        subtopicsService = {
            toggleSubtopic: vi.fn().mockResolvedValue(undefined),
            updateTopicProgress: vi.fn().mockResolvedValue(undefined),
            addSubtopic: vi.fn(),
            deleteSubtopic: vi.fn().mockResolvedValue(undefined)
        };

        TestBed.configureTestingModule({
            providers: [
                SubjectDetailComponent,
                { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' }, queryParamMap: { get: () => null } } } },
                { provide: Router, useValue: { navigate: vi.fn() } },
                { provide: SubjectsService, useValue: {} },
                { provide: TopicsService, useValue: topicsService },
                { provide: SubtopicsService, useValue: subtopicsService },
                { provide: ThemeService, useValue: {} },
                { provide: Title, useValue: { setTitle: vi.fn() } }
            ]
        });

        component = TestBed.inject(SubjectDetailComponent);
        toast = TestBed.inject(ToastService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('ticking a topic', () => {
        it('keeps the tick when the save works', async () => {
            component.topics.set([topic('t1')]);
            component.onProgressChanged({ topicId: 't1', completed: true, notes: '' });
            await vi.advanceTimersByTimeAsync(0);

            expect(current('t1').completed).toBe(true);
            expect(errorToast()).toBeUndefined();
        });

        it('undoes the tick when the save fails, and offers Retry', async () => {
            topicsService['upsertProgress'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1')]);

            component.onProgressChanged({ topicId: 't1', completed: true, notes: '' });
            await vi.advanceTimersByTimeAsync(0);

            expect(current('t1').completed).toBe(false);
            expect(errorToast()?.message).toBe("Couldn't save your progress.");
            expect(errorToast()?.action?.label).toBe('Retry');
        });

        it('never throws away typed notes when a save fails', async () => {
            topicsService['upsertProgress'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1', { notes: 'old' })]);

            component.onProgressChanged({ topicId: 't1', completed: false, notes: 'my long new notes' });
            await vi.advanceTimersByTimeAsync(0);

            expect(current('t1').notes).toBe('my long new notes');
            expect(errorToast()?.message).toBe("Couldn't save your notes.");
        });

        it('Retry saves again and keeps the tick when it works this time', async () => {
            topicsService['upsertProgress'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1')]);
            component.onProgressChanged({ topicId: 't1', completed: true, notes: 'n' });
            await vi.advanceTimersByTimeAsync(0);
            expect(current('t1').completed).toBe(false);

            errorToast()!.action!.handler();
            await vi.advanceTimersByTimeAsync(0);

            expect(topicsService['upsertProgress']).toHaveBeenCalledTimes(2);
            expect(topicsService['upsertProgress']).toHaveBeenLastCalledWith('t1', true, 'n');
            expect(current('t1').completed).toBe(true);
        });

        it('words the error for being offline', async () => {
            topicsService['upsertProgress'].mockRejectedValueOnce(new Error('offline'));
            TestBed.inject(NetworkStatusService).online.set(false);
            component.topics.set([topic('t1')]);

            component.onProgressChanged({ topicId: 't1', completed: true, notes: '' });
            await vi.advanceTimersByTimeAsync(0);

            expect(errorToast()?.message).toBe("You're offline, so we couldn't save your progress.");
        });
    });

    describe('ticking a subtopic', () => {
        it('syncs the topic only after the tick was saved', async () => {
            component.topics.set([topic('t1', { subtopics: [subtopic('a', false)] })]);

            component.onSubtopicToggled({ subtopicId: 'a', completed: true, topicId: 't1' });
            expect(subtopicsService['updateTopicProgress']).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(0);
            expect(subtopicsService['updateTopicProgress']).toHaveBeenCalledWith('t1', true);
            expect(current('t1').completed).toBe(true);
        });

        it('undoes the tick and the automatic topic state when the save fails, without syncing', async () => {
            subtopicsService['toggleSubtopic'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1', { subtopics: [subtopic('a', false)] })]);

            component.onSubtopicToggled({ subtopicId: 'a', completed: true, topicId: 't1' });
            expect(current('t1').completed).toBe(true); // shown instantly
            await vi.advanceTimersByTimeAsync(0);

            expect(current('t1').subtopics[0].completed).toBe(false);
            expect(current('t1').completed).toBe(false);
            expect(subtopicsService['updateTopicProgress']).not.toHaveBeenCalled();
            expect(errorToast()?.action?.label).toBe('Retry');
        });

        it('offers Retry if only the topic progress sync fails', async () => {
            subtopicsService['updateTopicProgress'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1', { subtopics: [subtopic('a', false)] })]);

            component.onSubtopicToggled({ subtopicId: 'a', completed: true, topicId: 't1' });
            await vi.advanceTimersByTimeAsync(0);

            expect(errorToast()?.message).toBe("Couldn't update the topic's progress.");
            errorToast()!.action!.handler();
            await vi.advanceTimersByTimeAsync(0);
            expect(subtopicsService['updateTopicProgress']).toHaveBeenCalledTimes(2);
        });
    });

    describe('editing a topic', () => {
        it('puts the old title and depth back when the save fails', async () => {
            topicsService['updateTopic'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('t1', { title: 'Old', depth: 'shallow' })]);

            component.onTopicEdited({ topicId: 't1', title: 'New', depth: 'deep' });
            expect(current('t1').title).toBe('New');
            await vi.advanceTimersByTimeAsync(0);

            expect(current('t1').title).toBe('Old');
            expect(current('t1').depth).toBe('shallow');
            expect(errorToast()?.action?.label).toBe('Retry');
        });
    });

    describe('reordering topics', () => {
        it('puts the old order back when the save fails, and Retry applies it again', async () => {
            topicsService['updateTopicsOrder'].mockRejectedValueOnce(new Error('offline'));
            const original = [topic('a'), topic('b'), topic('c')];
            component.topics.set(original);

            await component.onTopicDrop({ previousIndex: 0, currentIndex: 2 } as any);
            expect(component.topics().map(t => t.id)).toEqual(['a', 'b', 'c']);
            expect(errorToast()?.action?.label).toBe('Retry');

            errorToast()!.action!.handler();
            await vi.advanceTimersByTimeAsync(0);
            expect(component.topics().map(t => t.id)).toEqual(['b', 'c', 'a']);
            expect(topicsService['updateTopicsOrder']).toHaveBeenCalledTimes(2);
        });
    });

    describe('deleting a topic', () => {
        it('hides it at once, but only deletes after the undo window', async () => {
            component.topics.set([topic('a'), topic('b'), topic('c')]);

            component.onTopicDeleted('b');
            expect(component.topics().map(t => t.id)).toEqual(['a', 'c']);
            expect(topicsService['deleteTopic']).not.toHaveBeenCalled();
            expect(undoToast()?.message).toBe('"Topic b" deleted.');

            await vi.advanceTimersByTimeAsync(8000);
            expect(topicsService['deleteTopic']).toHaveBeenCalledWith('b');
        });

        it('Undo puts it back in the same place and nothing is ever deleted', async () => {
            component.topics.set([topic('a'), topic('b'), topic('c')]);
            component.onTopicDeleted('b');

            undoToast()!.action!.handler();
            expect(component.topics().map(t => t.id)).toEqual(['a', 'b', 'c']);

            await vi.advanceTimersByTimeAsync(60_000);
            expect(topicsService['deleteTopic']).not.toHaveBeenCalled();
        });

        it('puts it back and says so if the real delete fails', async () => {
            topicsService['deleteTopic'].mockRejectedValueOnce(new Error('offline'));
            component.topics.set([topic('a'), topic('b')]);
            component.onTopicDeleted('b');

            await vi.advanceTimersByTimeAsync(8000);

            expect(component.topics().map(t => t.id)).toEqual(['a', 'b']);
            expect(errorToast()?.message).toBe('Couldn\'t delete "Topic b". It has been put back.');
        });
    });

    describe('deleting a subtopic', () => {
        it('Undo brings the subtopic back where it was and restores the topic state', async () => {
            component.topics.set([topic('t1', {
                completed: false,
                subtopics: [subtopic('a', true), subtopic('b', false), subtopic('c', true)]
            })]);

            component.onSubtopicDeleted({ subtopicId: 'b', topicId: 't1' });
            expect(current('t1').subtopics.map(s => s.id)).toEqual(['a', 'c']);
            expect(current('t1').completed).toBe(true); // the rest are all done
            expect(subtopicsService['deleteSubtopic']).not.toHaveBeenCalled();

            undoToast()!.action!.handler();
            expect(current('t1').subtopics.map(s => s.id)).toEqual(['a', 'b', 'c']);
            expect(current('t1').completed).toBe(false);

            await vi.advanceTimersByTimeAsync(60_000);
            expect(subtopicsService['deleteSubtopic']).not.toHaveBeenCalled();
            expect(subtopicsService['updateTopicProgress']).not.toHaveBeenCalled();
        });

        it('deletes for real after the window and then syncs the topic progress', async () => {
            component.topics.set([topic('t1', { subtopics: [subtopic('a', true), subtopic('b', false)] })]);

            component.onSubtopicDeleted({ subtopicId: 'b', topicId: 't1' });
            await vi.advanceTimersByTimeAsync(8000);

            expect(subtopicsService['deleteSubtopic']).toHaveBeenCalledWith('b');
            expect(subtopicsService['updateTopicProgress']).toHaveBeenCalledWith('t1', true);
        });
    });
});
