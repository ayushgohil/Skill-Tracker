import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Topic, TopicWithProgress, Depth, SubjectWithTopics, Subtopic } from '../models';
import { ActivityService } from './activity.service';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class TopicsService {

    constructor(private activityService: ActivityService, private cacheService: CacheService) {}

    async getSubjectsWithTopics(): Promise<SubjectWithTopics[]> {
        const cacheKey = 'subjects_with_topics';
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        const { data: { user } } = await supabase.auth.getUser();

        this.cacheService.incrementDbCall('getSubjectsWithTopics_subjects');
        const { data: subjects, error: subErr } = await supabase
            .from('subjects')
            .select('*')
            .order('created_at', { ascending: true });
        if (subErr) throw subErr;

        this.cacheService.incrementDbCall('getSubjectsWithTopics_topics');
        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .order('created_at', { ascending: true });
        if (topErr) throw topErr;

        this.cacheService.incrementDbCall('getSubjectsWithTopics_progress');
        const { data: progress, error: progErr } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user!.id);
        if (progErr) throw progErr;

        // Batch-fetch ALL subtopics for this user in one query
        this.cacheService.incrementDbCall('getSubjectsWithTopics_subtopics');
        const { data: allSubtopics, error: subTopErr } = await supabase
            .from('subtopics')
            .select('*')
            .eq('user_id', user!.id)
            .order('order', { ascending: true });
        if (subTopErr) throw subTopErr;

        const result = (subjects ?? []).map(sub => {
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

        this.cacheService.set(cacheKey, result);
        return result;
    }

    async addTopic(subjectId: string, title: string, depth: Depth): Promise<Topic> {
        this.cacheService.incrementDbCall('addTopic');
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('topics')
            .insert({ subject_id: subjectId, title, depth, user_id: user!.id })
            .select()
            .single();
        if (error) throw error;
        this.cacheService.clear('subjects_with_topics');
        this.cacheService.clear(`topics_for_subject_${subjectId}`);
        return data as Topic;
    }

    async updateTopic(id: string, title: string, depth: Depth): Promise<void> {
        this.cacheService.incrementDbCall('updateTopic');
        const { error } = await supabase
            .from('topics')
            .update({ title, depth })
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clear('subjects_with_topics');
        // Might also need to clear topics_for_subject_*, but since we don't know subject_id here,
        // we could just clear all or assume it's handled by subjects_with_topics.
        // Or we can just clear everything to be safe.
        this.cacheService.clear();
    }

    async deleteTopic(id: string): Promise<void> {
        this.cacheService.incrementDbCall('deleteTopic');
        const { error } = await supabase
            .from('topics')
            .delete()
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clear(); // Clearing all to be safe since we don't have subjectId
    }

    async upsertProgress(topicId: string, completed: boolean, notes: string): Promise<void> {
        this.cacheService.incrementDbCall('upsertProgress');
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
        
        this.cacheService.clear('subjects_with_topics');
        this.cacheService.clear(); // Clear all to avoid stale data

        
        // Log activity if completed
        if (completed) {
            this.activityService.logActivity();
        }
    }
}