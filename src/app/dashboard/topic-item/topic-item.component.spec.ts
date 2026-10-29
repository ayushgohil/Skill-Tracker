import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TopicItemComponent, ProgressChange } from './topic-item.component';
import { TopicWithProgress } from '../../core/models';

/**
 * Tests the notes "Saving / Saved / Not saved" label. The template is replaced by an
 * empty one: only the logic is under test.
 */
describe('TopicItemComponent: notes save label', () => {
    let fixture: ComponentFixture<TopicItemComponent>;
    let component: TopicItemComponent;
    let emitted: ProgressChange[];

    const topic = (notes = ''): TopicWithProgress => ({
        id: 't1', user_id: 'u', subject_id: 's1', title: 'Topic', depth: 'medium', starred: false,
        created_at: '', completed: false, notes, subtopics: []
    });

    /** Types something and lets the 800ms auto-save delay pass. */
    const typeAndWait = async (text: string) => {
        component.localNotes = text;
        component.onNotesInput();
        await vi.advanceTimersByTimeAsync(800);
    };

    beforeEach(async () => {
        vi.useFakeTimers();
        TestBed.overrideComponent(TopicItemComponent, { set: { template: '', imports: [] } });
        await TestBed.configureTestingModule({ imports: [TopicItemComponent] }).compileComponents();

        fixture = TestBed.createComponent(TopicItemComponent);
        fixture.componentRef.setInput('topic', topic('old'));
        fixture.componentRef.setInput('isOpen', true);
        fixture.componentRef.setInput('subjectName', 'Maths');
        fixture.detectChanges();
        component = fixture.componentInstance;

        emitted = [];
        component.progressChanged.subscribe(e => emitted.push(e));
    });

    afterEach(() => {
        fixture.destroy();
        vi.useRealTimers();
    });

    it('shows nothing until you type', () => {
        expect(component.saveStatus()).toBe('idle');
        expect(component.localNotes).toBe('old');
    });

    it('says "Saving" while typing and while the save is running, not "Saved"', async () => {
        component.localNotes = 'new';
        component.onNotesInput();
        expect(component.saveStatus()).toBe('saving');

        await vi.advanceTimersByTimeAsync(800);
        expect(emitted).toHaveLength(1);
        expect(emitted[0].notes).toBe('new');
        expect(component.saveStatus()).toBe('saving'); // still waiting for the database
    });

    it('says "Saved" only after the save worked, then fades away', async () => {
        await typeAndWait('new');
        emitted[0].onResult!(true);
        expect(component.saveStatus()).toBe('saved');

        await vi.advanceTimersByTimeAsync(2000);
        expect(component.saveStatus()).toBe('idle');
    });

    it('says "Not saved" when the save fails, and keeps saying it', async () => {
        await typeAndWait('my long notes');
        emitted[0].onResult!(false);
        expect(component.saveStatus()).toBe('failed');

        await vi.advanceTimersByTimeAsync(60_000);
        expect(component.saveStatus()).toBe('failed');
        expect(component.localNotes).toBe('my long notes'); // nothing typed is lost
    });

    it('does not overwrite typed notes with the old ones when the topic updates', async () => {
        await typeAndWait('my long notes');
        emitted[0].onResult!(false);

        fixture.componentRef.setInput('topic', topic('old')); // parent reverted/reloaded
        fixture.detectChanges();
        expect(component.localNotes).toBe('my long notes');
    });

    it('Retry saves the same notes again and "Saved" shows when it works', async () => {
        await typeAndWait('my long notes');
        emitted[0].onResult!(false);

        component.retryNoteSave();
        expect(component.saveStatus()).toBe('saving');
        expect(emitted).toHaveLength(2);
        expect(emitted[1].notes).toBe('my long notes');

        emitted[1].onResult!(true);
        expect(component.saveStatus()).toBe('saved');
    });

    it('ignores a late answer from an older save', async () => {
        await typeAndWait('first');
        await typeAndWait('second');
        expect(emitted).toHaveLength(2);

        emitted[0].onResult!(false); // the old save fails late
        expect(component.saveStatus()).toBe('saving'); // the newer save decides

        emitted[1].onResult!(true);
        expect(component.saveStatus()).toBe('saved');
    });

    it('keeps saying "Saving" if you typed more while the save was running', async () => {
        await typeAndWait('first');
        component.localNotes = 'first and more';
        component.onNotesInput();

        emitted[0].onResult!(true);
        expect(component.saveStatus()).toBe('saving');
    });

    it('saves when you leave the notes box with unsaved typing', () => {
        component.localNotes = 'quick';
        component.onNotesInput();
        component.onNotesBlur();
        expect(emitted).toHaveLength(1);
        expect(emitted[0].notes).toBe('quick');
    });
});
