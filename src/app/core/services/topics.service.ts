// src/app/core/services/topics.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Topic, TopicWithProgress, Depth, SubjectWithTopics, Subtopic } from '../models';

@Injectable({ providedIn: 'root' })
export class TopicsService {

    async getSubjectsWithTopics(): Promise<SubjectWithTopics[]> {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: subjects, error: subErr } = await supabase
            .from('subjects')
            .select('*')
            .order('created_at', { ascending: true });
        if (subErr) throw subErr;

        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .order('created_at', { ascending: true });
        if (topErr) throw topErr;

        const { data: progress, error: progErr } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user!.id);
        if (progErr) throw progErr;

        // Batch-fetch ALL subtopics for this user in one query
        const { data: allSubtopics, error: subTopErr } = await supabase
            .from('subtopics')
            .select('*')
            .eq('user_id', user!.id)
            .order('order', { ascending: true });
        if (subTopErr) throw subTopErr;

        return (subjects ?? []).map(sub => {
            const subTopics: TopicWithProgress[] = (topics ?? [])
                .filter(t => t.subject_id === sub.id)
                .map(t => {
                    const p = (progress ?? []).find(pr => pr.topic_id === t.id);
                    const topicSubtopics = (allSubtopics ?? []).filter(st => st.topic_id === t.id);
                    return {
                        ...t,
                        completed: p?.completed ?? false,
                        notes: p?.notes ?? '',
                        subtopics: topicSubtopics as Subtopic[]
                    };
                });

            const totalCount = subTopics.reduce((sum, t) =>
                sum + (t.subtopics.length > 0 ? t.subtopics.length : 1), 0);

            const completedCount = subTopics.reduce((sum, t) => {
                if (t.subtopics.length > 0) {
                    return sum + t.subtopics.filter(s => s.completed).length;
                }
                return sum + (t.completed ? 1 : 0);
            }, 0);

            return {
                ...sub,
                topics: subTopics,
                completedCount,
                totalCount,
                percent: totalCount ? Math.round((completedCount / totalCount) * 100) : 0
            };
        });
    }

    async addTopic(subjectId: string, title: string, depth: Depth): Promise<Topic> {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('topics')
            .insert({ subject_id: subjectId, title, depth, user_id: user!.id })
            .select()
            .single();
        if (error) throw error;
        return data as Topic;
    }

    async updateTopic(id: string, title: string, depth: Depth): Promise<void> {
        const { error } = await supabase
            .from('topics')
            .update({ title, depth })
            .eq('id', id);
        if (error) throw error;
    }

    async deleteTopic(id: string): Promise<void> {
        const { error } = await supabase
            .from('topics')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    async upsertProgress(topicId: string, completed: boolean, notes: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('user_progress')
            .upsert({
                user_id: user!.id,
                topic_id: topicId,
                completed,
                notes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,topic_id' });
        if (error) throw error;
    }
}