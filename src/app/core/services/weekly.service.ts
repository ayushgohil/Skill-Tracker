import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { fetchAllRows, fetchAllRowsForIds } from '../supabase-paging';
import { AuthService } from './auth.service';
import { CacheService } from './cache.service';
import {
    WeeklyReview,
    TopicWithProgress,
    StarredTopic,
    SubjectWithTopics,
    Subject,
    Subtopic
} from '../models';

@Injectable({ providedIn: 'root' })
export class WeeklyService {

    constructor(
        private auth: AuthService,
        private cacheService: CacheService
    ) {}

    // ── Helpers ───────────────────────────────────────
    getWeekStart(date: Date = new Date()): string {
        const d = new Date(date);
        const day = d.getDay(); // 0=Sun, 1=Mon...
        const diff = (day === 0 ? -6 : 1 - day);
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    }

    // ── Last review ───────────────────────────────────
    async getLastReview(): Promise<WeeklyReview | null> {
        const userId = await this.auth.ensureUserId();
        const { data, error } = await supabase
            .from('weekly_reviews')
            .select('*')
            .eq('user_id', userId)
            .order('completed_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data && data.length > 0 ? data[0] as WeeklyReview : null;
    }

    // ── Is review due? ────────────────────────────────
    async isReviewDue(forceRefresh = false): Promise<boolean> {
        if (!forceRefresh) {
            const cached = this.cacheService.get('weekly_review_due');
            if (cached !== undefined && cached !== null) return cached;
        }

        const last = await this.getLastReview();
        const isDue = !last ? true : last.week_start !== this.getWeekStart();
        this.cacheService.set('weekly_review_due', isDue);
        return isDue;
    }

    // ── Topics completed this week ────────────────────
    async getCompletedThisWeek(): Promise<TopicWithProgress[]> {
        const userId = await this.auth.ensureUserId();
        const weekStart = this.getWeekStart();

        // 1. Get user_progress rows completed this week
        const { data: progress, error: progErr } = await supabase
            .from('user_progress')
            .select('topic_id, completed, notes')
            .eq('user_id', userId)
            .eq('completed', true)
            .gte('updated_at', weekStart);
        if (progErr) throw progErr;
        if (!progress || progress.length === 0) return [];

        const topicIds = progress.map(p => p.topic_id);

        // 2. Get matching topics (ids in small groups so the request address stays short)
        const topics = await fetchAllRowsForIds<any>(topicIds, (idChunk, from, to) => supabase
            .from('topics')
            .select('*', { count: 'exact' })
            .in('id', idChunk)
            .order('id', { ascending: true })
            .range(from, to));

        // 3. Merge
        return (topics ?? []).map(t => {
            const p = progress.find(pr => pr.topic_id === t.id);
            return {
                ...t,
                completed: true,
                notes: p?.notes ?? '',
                subtopics: []
            };
        });
    }

    // ── Current week's starred topics ─────────────────
    async getCurrentStarredTopics(): Promise<StarredTopic[]> {
        const userId = await this.auth.ensureUserId();
        const weekStart = this.getWeekStart();

        const { data: goals, error: goalErr } = await supabase
            .from('weekly_goals')
            .select('topic_id')
            .eq('user_id', userId)
            .eq('week_start', weekStart);
        if (goalErr) throw goalErr;
        if (!goals || goals.length === 0) return [];

        const topicIds = goals.map(g => g.topic_id);

        const [topicsRes, subjectsRes, progressRes] = await Promise.all([
            supabase.from('topics').select('id, user_id, subject_id, title, depth, starred, created_at').in('id', topicIds),
            supabase.from('subjects').select('id, name, color').eq('user_id', userId),
            supabase.from('user_progress').select('topic_id, completed, notes').eq('user_id', userId).in('topic_id', topicIds)
        ]);

        if (topicsRes.error) throw topicsRes.error;
        if (subjectsRes.error) throw subjectsRes.error;
        if (progressRes.error) throw progressRes.error;

        const subjects = subjectsRes.data ?? [];
        const progress = progressRes.data ?? [];

        return (topicsRes.data ?? []).map(t => {
            const sub = subjects.find(s => s.id === t.subject_id);
            const p = progress.find(pr => pr.topic_id === t.id);
            return {
                ...t,
                completed: p?.completed ?? false,
                notes: p?.notes ?? '',
                subtopics: [],
                subject_name: sub?.name ?? '',
                subject_color: sub?.color ?? '#71717a'
            };
        });
    }

    // ── All starred topics (for dashboard) ────────────
    async getAllStarredTopics(forceRefresh = false): Promise<StarredTopic[]> {
        if (!forceRefresh) {
            const cached = this.cacheService.get('weekly_starred_topics');
            if (cached) return cached;
        }

        const userId = await this.auth.ensureUserId();

        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('id, user_id, subject_id, title, depth, starred, created_at')
            .eq('user_id', userId)
            .eq('starred', true);
        if (topErr) throw topErr;
        if (!topics || topics.length === 0) {
            this.cacheService.set('weekly_starred_topics', []);
            return [];
        }

        const topicIds = topics.map(t => t.id);

        const [subjectsRes, progressRes] = await Promise.all([
            supabase.from('subjects').select('id, name, color').eq('user_id', userId),
            supabase.from('user_progress').select('topic_id, completed').eq('user_id', userId).in('topic_id', topicIds)
        ]);

        if (subjectsRes.error) throw subjectsRes.error;
        if (progressRes.error) throw progressRes.error;

        const subjects = subjectsRes.data ?? [];
        const progress = progressRes.data ?? [];

        const result = topics
            .map(t => {
                const sub = subjects.find(s => s.id === t.subject_id);
                const p = progress.find(pr => pr.topic_id === t.id);
                return {
                    ...t,
                    completed: p?.completed ?? false,
                    notes: '',
                    subtopics: [],
                    subject_name: sub?.name ?? '',
                    subject_color: sub?.color ?? '#71717a'
                };
            })
            .filter(t => !t.completed);

        this.cacheService.set('weekly_starred_topics', result);
        return result;
    }

    // ── Incomplete topics across all subjects ─────────
    async getIncompleteTopicsAllSubjects(): Promise<StarredTopic[]> {
        const userId = await this.auth.ensureUserId();

        // Batch fetch all data
        // Page by page: Supabase answers at most 1000 rows per request (see supabase-paging.ts)
        const [subjects, topics, progress] = await Promise.all([
            fetchAllRows<any>((from, to) => supabase.from('subjects').select('id, name, color', { count: 'exact' })
                .eq('user_id', userId).order('name').order('id').range(from, to)),
            fetchAllRows<any>((from, to) => supabase.from('topics')
                .select('id, user_id, subject_id, title, depth, starred, created_at', { count: 'exact' })
                .eq('user_id', userId).order('title').order('id').range(from, to)),
            fetchAllRows<any>((from, to) => supabase.from('user_progress').select('topic_id, completed', { count: 'exact' })
                .eq('user_id', userId).order('topic_id').range(from, to))
        ]);

        // Filter to incomplete topics (no progress row = incomplete, completed=false = incomplete)
        const incomplete = topics.filter(t => {
            const p = progress.find(pr => pr.topic_id === t.id);
            return !p || !p.completed;
        });

        // Map to StarredTopic, sorted by subject name then title
        return incomplete
            .map(t => {
                const sub = subjects.find(s => s.id === t.subject_id);
                const p = progress.find(pr => pr.topic_id === t.id);
                return {
                    ...t,
                    completed: false,
                    notes: '',
                    subtopics: [] as Subtopic[],
                    subject_name: sub?.name ?? '',
                    subject_color: sub?.color ?? '#71717a'
                };
            })
            .sort((a, b) =>
                a.subject_name.localeCompare(b.subject_name) ||
                a.title.localeCompare(b.title)
            );
    }

    // ── Save weekly review ────────────────────────────
    async saveWeeklyReview(starredTopicIds: string[]): Promise<void> {
        const userId = await this.auth.ensureUserId();
        const weekStart = this.getWeekStart();

        // 1. Delete old weekly_goals for this week
        const { error: delErr } = await supabase
            .from('weekly_goals')
            .delete()
            .eq('user_id', userId)
            .eq('week_start', weekStart);
        if (delErr) throw delErr;

        // 2. Insert new weekly_goals
        if (starredTopicIds.length > 0) {
            const rows = starredTopicIds.map(tid => ({
                user_id: userId,
                topic_id: tid,
                week_start: weekStart
            }));
            const { error: insErr } = await supabase
                .from('weekly_goals')
                .insert(rows);
            if (insErr) throw insErr;
        }

        // 3. Unstar all user's topics
        const { error: unstarErr } = await supabase
            .from('topics')
            .update({ starred: false })
            .eq('user_id', userId);
        if (unstarErr) throw unstarErr;

        // 4. Star selected topics
        if (starredTopicIds.length > 0) {
            const { error: starErr } = await supabase
                .from('topics')
                .update({ starred: true })
                .in('id', starredTopicIds);
            if (starErr) throw starErr;
        }

        // 5. Upsert weekly_reviews
        const { error: revErr } = await supabase
            .from('weekly_reviews')
            .upsert({
                user_id: userId,
                week_start: weekStart,
                completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,week_start' });
        if (revErr) throw revErr;

        // Invalidate weekly cache and subjects cache so dashboard loads fresh data from DB
        this.cacheService.clearWeekly();
        this.cacheService.clearSubjects();
    }

    // ── Weakest subject (pure computation) ────────────
    getWeakestSubject(subjects: SubjectWithTopics[]): Subject | null {
        const withTopics = subjects.filter(s => s.totalCount > 0);
        if (withTopics.length === 0) return null;
        return withTopics.reduce((min, s) =>
            s.percent < min.percent ? s : min
        );
    }
}
