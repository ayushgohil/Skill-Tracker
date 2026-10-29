import { SubjectWithTopics } from '../core/models';
import {
    applySubjectView, matchingTopicTitles, isViewChanged, DEFAULT_VIEW, SubjectView, isStatusFilter, isSortOption
} from './subject-view';

const subject = (id: string, name: string, percent: number, extra: Partial<SubjectWithTopics> = {}, topics: string[] = []): SubjectWithTopics => ({
    id, user_id: 'u', name, color: '#000', created_at: '2026-01-01T00:00:00Z',
    completedCount: percent, totalCount: 100, percent,
    topics: topics.map((title, i) => ({
        id: `${id}-${i}`, user_id: 'u', subject_id: id, title, depth: 'medium', starred: false,
        created_at: '', completed: false, notes: '', subtopics: []
    })),
    ...extra
});

const view = (extra: Partial<SubjectView> = {}): SubjectView => ({ ...DEFAULT_VIEW, ...extra });
const names = (list: SubjectWithTopics[]) => list.map(s => s.name);

describe('subject view: search, filter and sort', () => {
    const list = [
        subject('1', 'Angular', 40, {}, ['Signals', 'Routing']),
        subject('2', 'Café French', 0, { created_at: '2026-03-01T00:00:00Z' }),
        subject('3', 'Algebra', 100, { is_shared: true, created_at: '2026-02-01T00:00:00Z' }, ['Closures and functions']),
        subject('4', 'Guitar', 75)
    ];

    it('keeps the list and its order when nothing is chosen', () => {
        expect(names(applySubjectView(list, view()))).toEqual(['Angular', 'Café French', 'Algebra', 'Guitar']);
    });

    it('does not change the list it is given', () => {
        const copy = [...list];
        applySubjectView(list, view({ sort: 'name' }));
        expect(list).toEqual(copy);
    });

    describe('search', () => {
        it('finds subjects by name, ignoring capitals', () => {
            expect(names(applySubjectView(list, view({ query: 'ANG' })))).toEqual(['Angular']);
        });

        it('ignores accents in both directions', () => {
            expect(names(applySubjectView(list, view({ query: 'cafe' })))).toEqual(['Café French']);
            expect(names(applySubjectView(list, view({ query: 'café' })))).toEqual(['Café French']);
        });

        it('finds a subject by one of its topic titles', () => {
            expect(names(applySubjectView(list, view({ query: 'closures' })))).toEqual(['Algebra']);
        });

        it('needs every word to match somewhere', () => {
            expect(names(applySubjectView(list, view({ query: 'angular routing' })))).toEqual(['Angular']);
            expect(names(applySubjectView(list, view({ query: 'angular guitar' })))).toEqual([]);
        });

        it('treats spaces only as "no search"', () => {
            expect(applySubjectView(list, view({ query: '   ' }))).toHaveLength(4);
        });

        it('lists the matching topic titles for the hint under a subject', () => {
            expect(matchingTopicTitles(list[0], 'sig')).toEqual(['Signals']);
            expect(matchingTopicTitles(list[0], '')).toEqual([]);
            expect(matchingTopicTitles(list[0], 'zzz')).toEqual([]);
        });
    });

    describe('filter', () => {
        it('in progress: more than 0% and less than 100%', () => {
            expect(names(applySubjectView(list, view({ status: 'in-progress' })))).toEqual(['Angular', 'Guitar']);
        });
        it('not started: 0%', () => {
            expect(names(applySubjectView(list, view({ status: 'not-started' })))).toEqual(['Café French']);
        });
        it('completed: 100%', () => {
            expect(names(applySubjectView(list, view({ status: 'completed' })))).toEqual(['Algebra']);
        });
        it('does not call an empty subject completed', () => {
            const empty = subject('9', 'Empty', 100, { totalCount: 0 });
            expect(applySubjectView([empty], view({ status: 'completed' }))).toEqual([]);
        });
        it('shared: only shared subjects', () => {
            expect(names(applySubjectView(list, view({ status: 'shared' })))).toEqual(['Algebra']);
        });
        it('works together with search', () => {
            expect(names(applySubjectView(list, view({ status: 'in-progress', query: 'gui' })))).toEqual(['Guitar']);
            expect(applySubjectView(list, view({ status: 'completed', query: 'gui' }))).toEqual([]);
        });
    });

    describe('sort', () => {
        it('by name', () => {
            expect(names(applySubjectView(list, view({ sort: 'name' })))).toEqual(['Algebra', 'Angular', 'Café French', 'Guitar']);
        });
        it('by most progress', () => {
            expect(names(applySubjectView(list, view({ sort: 'progress-high' })))).toEqual(['Algebra', 'Guitar', 'Angular', 'Café French']);
        });
        it('by least progress', () => {
            expect(names(applySubjectView(list, view({ sort: 'progress-low' })))).toEqual(['Café French', 'Angular', 'Guitar', 'Algebra']);
        });
        it('newest first', () => {
            expect(names(applySubjectView(list, view({ sort: 'newest' })))).toEqual(['Café French', 'Algebra', 'Angular', 'Guitar']);
        });
    });

    describe('knowing when the view is not the user\'s own list', () => {
        it('is unchanged by default', () => expect(isViewChanged(DEFAULT_VIEW)).toBe(false));
        it('changes with a search, a filter or a sort', () => {
            expect(isViewChanged(view({ query: 'a' }))).toBe(true);
            expect(isViewChanged(view({ status: 'completed' }))).toBe(true);
            expect(isViewChanged(view({ sort: 'name' }))).toBe(true);
        });
        it('ignores a search of only spaces', () => expect(isViewChanged(view({ query: '  ' }))).toBe(false));
    });

    it('recognises only valid saved values', () => {
        expect(isStatusFilter('completed')).toBe(true);
        expect(isStatusFilter('banana')).toBe(false);
        expect(isSortOption('name')).toBe(true);
        expect(isSortOption(undefined)).toBe(false);
    });
});
