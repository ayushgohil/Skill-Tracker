// src/app/core/services/topics.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Topic, TopicWithProgress, Depth, CategoryWithTopics } from '../models';

@Injectable({ providedIn: 'root' })
export class TopicsService {

    async getCategoriesWithTopics(): Promise<CategoryWithTopics[]> {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: categories, error: catErr } = await supabase
            .from('categories')
            .select('*')
            .order('created_at', { ascending: true });
        if (catErr) throw catErr;

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

        return (categories ?? []).map(cat => {
            const catTopics: TopicWithProgress[] = (topics ?? [])
                .filter(t => t.category_id === cat.id)
                .map(t => {
                    const p = (progress ?? []).find(pr => pr.topic_id === t.id);
                    return {
                        ...t,
                        completed: p?.completed ?? false,
                        notes: p?.notes ?? ''
                    };
                });

            const completedCount = catTopics.filter(t => t.completed).length;
            const totalCount = catTopics.length;

            return {
                ...cat,
                topics: catTopics,
                completedCount,
                totalCount,
                percent: totalCount ? Math.round((completedCount / totalCount) * 100) : 0
            };
        });
    }

    async addTopic(categoryId: string, title: string, depth: Depth): Promise<Topic> {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('topics')
            .insert({ category_id: categoryId, title, depth, user_id: user!.id })
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