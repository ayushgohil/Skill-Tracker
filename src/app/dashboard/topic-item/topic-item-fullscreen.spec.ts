import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TopicItemComponent, ProgressChange } from './topic-item.component';
import { TopicWithProgress } from '../../core/models';

/**
 * Tests the notes full-screen mode. The template is replaced by a tiny one that has just the
 * notes wrapper: the logic for moving it, the double-Esc close and the cleanup is what matters.
 */
describe('TopicItemComponent: notes full screen', () => {
    let fixture: ComponentFixture<TopicItemComponent>;
    let component: TopicItemComponent;
    let host: HTMLElement;
    let wrap: HTMLElement;

    const topic = (): TopicWithProgress => ({
        id: 't1', user_id: 'u', subject_id: 's1', title: 'Topic', depth: 'medium', starred: false,
        created_at: '', completed: false, notes: 'old', subtopics: []
    });

    const pressEsc = () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    beforeEach(async () => {
        vi.useFakeTimers();
        TestBed.overrideComponent(TopicItemComponent, {
            set: {
                template: `<div id="host-inner"><div #notesWrap class="notes-wrap" [class.notes-fs]="notesFullscreen()">notes</div></div>`,
                imports: []
            }
        });
        await TestBed.configureTestingModule({ imports: [TopicItemComponent] }).compileComponents();

        fixture = TestBed.createComponent(TopicItemComponent);
        fixture.componentRef.setInput('topic', topic());
        fixture.componentRef.setInput('isOpen', true);
        fixture.componentRef.setInput('subjectName', 'Maths');
        fixture.detectChanges();
        component = fixture.componentInstance;
        host = fixture.nativeElement.querySelector('#host-inner');
        wrap = host.querySelector('.notes-wrap') as HTMLElement;
    });

    afterEach(() => {
        fixture.destroy();
        vi.useRealTimers();
        document.body.style.overflow = '';
    });

    it('moves the notes section to <body>, marks it full screen and locks page scrolling', () => {
        component.openNotesFullscreen();
        fixture.detectChanges();

        expect(component.notesFullscreen()).toBe(true);
        expect(wrap.parentElement).toBe(document.body);
        expect(wrap.classList.contains('notes-fs')).toBe(true);
        expect(document.body.style.overflow).toBe('hidden');
    });

    it('does not close on a single Esc, it only shows the hint', () => {
        component.openNotesFullscreen();
        pressEsc();
        vi.advanceTimersByTime(500);

        expect(component.notesFullscreen()).toBe(true);
        expect(component.escHint()).toBe(true);
    });

    it('closes on a second Esc, after the fade-out, and puts the section back in place', () => {
        component.openNotesFullscreen();
        pressEsc();
        vi.advanceTimersByTime(400);
        pressEsc();

        // Fading out: still open, marked as closing.
        expect(component.notesFullscreen()).toBe(true);
        expect(wrap.classList.contains('notes-fs-closing')).toBe(true);

        vi.advanceTimersByTime(200);
        fixture.detectChanges();

        expect(component.notesFullscreen()).toBe(false);
        expect(wrap.parentElement).toBe(host);
        expect(wrap.classList.contains('notes-fs-closing')).toBe(false);
        expect(document.body.style.overflow).toBe('');
    });

    it('treats two Esc presses far apart as two single presses', () => {
        component.openNotesFullscreen();
        pressEsc();
        vi.advanceTimersByTime(2000); // hint gone, window over
        expect(component.escHint()).toBe(false);
        pressEsc();
        vi.advanceTimersByTime(500);

        expect(component.notesFullscreen()).toBe(true);
    });

    it('closes with the Close button', () => {
        component.openNotesFullscreen();
        component.closeNotesFullscreen();
        vi.advanceTimersByTime(200);

        expect(component.notesFullscreen()).toBe(false);
        expect(wrap.parentElement).toBe(host);
    });

    it('saves unsaved notes right away when closing, without waiting for the autosave delay', () => {
        const emitted: ProgressChange[] = [];
        component.progressChanged.subscribe(e => emitted.push(e));

        component.openNotesFullscreen();
        component.localNotes = 'typed in full screen';
        component.onNotesInput();
        component.closeNotesFullscreen();

        expect(emitted).toHaveLength(1);
        expect(emitted[0].notes).toBe('typed in full screen');
    });

    it('ignores Esc once it is closed', () => {
        component.openNotesFullscreen();
        component.closeNotesFullscreen();
        vi.advanceTimersByTime(200);
        pressEsc();

        expect(component.escHint()).toBe(false);
    });

    describe('Alt+N shortcut', () => {
        const press = (init: KeyboardEventInit) =>
            document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
        const altN = (init: KeyboardEventInit = {}) => press({ code: 'KeyN', key: 'n', altKey: true, ...init });

        it('opens full screen, and closes it again on a second press', () => {
            altN();
            expect(component.notesFullscreen()).toBe(true);

            altN();
            vi.advanceTimersByTime(200);
            expect(component.notesFullscreen()).toBe(false);
        });

        it('works on a Mac, where Option+N types "˜" instead of "n"', () => {
            altN({ key: '˜' });
            expect(component.notesFullscreen()).toBe(true);
        });

        it('does nothing for other key combinations', () => {
            press({ code: 'KeyN', key: 'n' });                          // plain N (typing)
            altN({ ctrlKey: true });
            altN({ metaKey: true });
            altN({ shiftKey: true });
            press({ code: 'KeyM', key: 'm', altKey: true });
            expect(component.notesFullscreen()).toBe(false);
        });

        it('ignores a held-down key, so it does not flicker open and closed', () => {
            altN({ repeat: true });
            expect(component.notesFullscreen()).toBe(false);
        });

        it('does nothing while the topic is collapsed', () => {
            fixture.componentRef.setInput('isOpen', false);
            fixture.detectChanges();
            altN();
            expect(component.notesFullscreen()).toBe(false);
        });

        it('with several topics open, only the one you last worked in responds', () => {
            const second = TestBed.createComponent(TopicItemComponent);
            second.componentRef.setInput('topic', topic());
            second.componentRef.setInput('isOpen', true);
            second.componentRef.setInput('subjectName', 'Maths');
            second.detectChanges();

            component.markActive();
            altN();

            expect(component.notesFullscreen()).toBe(true);
            expect(second.componentInstance.notesFullscreen()).toBe(false);
            second.destroy();
        });

        it('stops listening once the topic is destroyed', () => {
            fixture.destroy();
            expect(() => altN()).not.toThrow();
            expect(component.notesFullscreen()).toBe(false);
        });
    });

    it('removes the section from <body> if the topic is destroyed while full screen is open', () => {
        component.openNotesFullscreen();
        expect(document.body.contains(wrap)).toBe(true);

        fixture.destroy();

        expect(document.body.contains(wrap)).toBe(false);
        expect(document.body.style.overflow).toBe('');
    });
});
