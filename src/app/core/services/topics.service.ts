// src/app/core/services/topics.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

export interface Topic {
    id: string;
    title: string;
    category: 'Angular' | 'Backend';
    depth: 'shallow' | 'medium' | 'deep';
}

export interface UserTopic {
    id?: string;
    user_id?: string;
    topic_id: string;
    completed: boolean;
    notes: string;
}

export interface TopicWithProgress extends Topic {
    completed: boolean;
    notes: string;
    userTopicId?: string;
}

@Injectable({ providedIn: 'root' })
export class TopicsService {

    async getTopicsWithProgress(): Promise<TopicWithProgress[]> {
        const { data: topics, error: topicsErr } = await supabase
            .from('topics')
            .select('*')
            .order('category')
            .order('title');

        if (topicsErr) throw topicsErr;

        const { data: userTopics, error: utErr } = await supabase
            .from('user_topics')
            .select('*');

        if (utErr) throw utErr;

        return (topics as Topic[]).map(topic => {
            const ut = (userTopics as UserTopic[]).find(u => u.topic_id === topic.id);
            return {
                ...topic,
                completed: ut?.completed ?? false,
                notes: ut?.notes ?? '',
                userTopicId: ut?.id
            };
        });
    }

    async upsertUserTopic(topicId: string, completed: boolean, notes: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('user_topics')
            .upsert({
                user_id: user.id,
                topic_id: topicId,
                completed,
                notes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,topic_id' });

        if (error) throw error;
    }

    async addTopic(title: string, category: 'Angular' | 'Backend', depth: 'shallow' | 'medium' | 'deep') {
        const { error } = await supabase
            .from('topics')
            .insert({ title, category, depth });
        if (error) throw error;
    }
}