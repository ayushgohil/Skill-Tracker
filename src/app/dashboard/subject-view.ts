// src/app/dashboard/subject-view.ts
// Searching, filtering and sorting of the subject list on the dashboard.
// Pure functions (no Angular), so they are easy to test.
import { SubjectWithTopics } from '../core/models';

export type StatusFilter = 'all' | 'in-progress' | 'not-started' | 'completed' | 'shared';
export type SortOption = 'custom' | 'name' | 'progress-high' | 'progress-low' | 'newest';

export interface SubjectView {
    query: string;
    status: StatusFilter;
    sort: SortOption;
}

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'not-started', label: 'Not started' },
    { value: 'completed', label: 'Completed' },
    { value: 'shared', label: 'Shared' }
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'custom', label: 'My order' },
    { value: 'name', label: 'Name A to Z' },
    { value: 'progress-high', label: 'Most progress' },
    { value: 'progress-low', label: 'Least progress' },
    { value: 'newest', label: 'Newest first' }
];

export const DEFAULT_VIEW: SubjectView = { query: '', status: 'all', sort: 'custom' };

export function isStatusFilter(value: unknown): value is StatusFilter {
    return STATUS_FILTERS.some(f => f.value === value);
}

export function isSortOption(value: unknown): value is SortOption {
    return SORT_OPTIONS.some(o => o.value === value);
}

/** True when the list is shown differently from the user's own order. */
export function isViewChanged(view: SubjectView): boolean {
    return view.query.trim() !== '' || view.status !== 'all' || view.sort !== 'custom';
}

/** Lower case and without accents, so "cafe" finds "Café". */
function normalize(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Topic titles that match the search words (shown as a hint under the subject). */
export function matchingTopicTitles(subject: SubjectWithTopics, query: string): string[] {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (subject.topics ?? [])
        .filter(t => {
            const title = normalize(t.title);
            return words.every(w => title.includes(w));
        })
        .map(t => t.title);
}

function matchesQuery(subject: SubjectWithTopics, query: string): boolean {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const name = normalize(subject.name);
    // Every word must be found in the subject name or in one of its topic titles.
    const topicTitles = (subject.topics ?? []).map(t => normalize(t.title));
    return words.every(w => name.includes(w) || topicTitles.some(t => t.includes(w)));
}

function matchesStatus(subject: SubjectWithTopics, status: StatusFilter): boolean {
    switch (status) {
        case 'in-progress': return subject.percent > 0 && subject.percent < 100;
        case 'not-started': return subject.percent === 0;
        case 'completed': return subject.totalCount > 0 && subject.percent >= 100;
        case 'shared': return !!subject.is_shared;
        default: return true;
    }
}

/** Applies the search, the status filter and the sort. Never changes the input list. */
export function applySubjectView(subjects: SubjectWithTopics[], view: SubjectView): SubjectWithTopics[] {
    const result = subjects.filter(s => matchesQuery(s, view.query) && matchesStatus(s, view.status));

    switch (view.sort) {
        case 'name':
            return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        case 'progress-high':
            return result.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
        case 'progress-low':
            return result.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));
        case 'newest':
            return result.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
        default:
            return result; // the user's own order
    }
}
