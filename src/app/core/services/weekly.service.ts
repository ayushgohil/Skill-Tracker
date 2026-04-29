// src/app/core/services/weekly.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
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
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('weekly_reviews')
            .select('*')
            .eq('user_id', user!.id)
            .order('completed_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data && data.length > 0 ? data[0] as WeeklyReview : null;
    }

    // ── Is review due? ────────────────────────────────
    async isReviewDue(): Promise<boolean> {
        const last = await this.getLastReview();
        if (!last) return true;
        return last.week_start !== this.getWeekStart();
    }

    // ── Topics completed this week ────────────────────
    async getCompletedThisWeek(): Promise<TopicWithProgress[]> {
        const { data: { user } } = await supabase.auth.getUser();
        const weekStart = this.getWeekStart();

        // 1. Get user_progress rows completed this week
        const { data: progress, error: progErr } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user!.id)
            .eq('completed', true)
            .gte('updated_at', weekStart);
        if (progErr) throw progErr;
        if (!progress || progress.length === 0) return [];

        const topicIds = progress.map(p => p.topic_id);

        // 2. Get matching topics
        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .in('id', topicIds);
        if (topErr) throw topErr;

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
        const { data: { user } } = await supabase.auth.getUser();
        const weekStart = this.getWeekStart();

        const { data: goals, error: goalErr } = await supabase
            .from('weekly_goals')
            .select('*')
            .eq('user_id', user!.id)
            .eq('week_start', weekStart);
        if (goalErr) throw goalErr;
        if (!goals || goals.length === 0) return [];

        const topicIds = goals.map(g => g.topic_id);

        const [topicsRes, subjectsRes, progressRes] = await Promise.all([
            supabase.from('topics').select('*').in('id', topicIds),
            supabase.from('subjects').select('*').eq('user_id', user!.id),
            supabase.from('user_progress').select('*').eq('user_id', user!.id).in('topic_id', topicIds)
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
    async getAllStarredTopics(): Promise<StarredTopic[]> {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .eq('user_id', user!.id)
            .eq('starred', true);
        if (topErr) throw topErr;
        if (!topics || topics.length === 0) return [];

        const topicIds = topics.map(t => t.id);

        const [subjectsRes, progressRes] = await Promise.all([
            supabase.from('subjects').select('*').eq('user_id', user!.id),
            supabase.from('user_progress').select('*').eq('user_id', user!.id).in('topic_id', topicIds)
        ]);

        if (subjectsRes.error) throw subjectsRes.error;
        if (progressRes.error) throw progressRes.error;

        const subjects = subjectsRes.data ?? [];
        const progress = progressRes.data ?? [];

        return topics
            .map(t => {
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
            })
            .filter(t => !t.completed);
    }

    // ── Incomplete topics across all subjects ─────────
    async getIncompleteTopicsAllSubjects(): Promise<StarredTopic[]> {
        const { data: { user } } = await supabase.auth.getUser();

        // Batch fetch all data
        const [subjectsRes, topicsRes, progressRes] = await Promise.all([
            supabase.from('subjects').select('*').eq('user_id', user!.id).order('name'),
            supabase.from('topics').select('*').eq('user_id', user!.id).order('title'),
            supabase.from('user_progress').select('*').eq('user_id', user!.id)
        ]);

        if (subjectsRes.error) throw subjectsRes.error;
        if (topicsRes.error) throw topicsRes.error;
        if (progressRes.error) throw progressRes.error;

        const subjects = subjectsRes.data ?? [];
        const topics = topicsRes.data ?? [];
        const progress = progressRes.data ?? [];

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
                    notes: p?.notes ?? '',
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
        const { data: { user } } = await supabase.auth.getUser();
        const weekStart = this.getWeekStart();

        // 1. Delete old weekly_goals for this week
        const { error: delErr } = await supabase
            .from('weekly_goals')
            .delete()
            .eq('user_id', user!.id)
            .eq('week_start', weekStart);
        if (delErr) throw delErr;

        // 2. Insert new weekly_goals
        if (starredTopicIds.length > 0) {
            const rows = starredTopicIds.map(tid => ({
                user_id: user!.id,
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
            .eq('user_id', user!.id);
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
                user_id: user!.id,
                week_start: weekStart,
                completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,week_start' });
        if (revErr) throw revErr;
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
