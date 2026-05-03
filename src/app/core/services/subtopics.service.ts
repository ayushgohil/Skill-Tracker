// src/app/core/services/subtopics.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Subtopic } from '../models';
import { ActivityService } from './activity.service';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class SubtopicsService {

    constructor(private activityService: ActivityService, private cacheService: CacheService) {}

    async getSubtopicsForTopic(topicId: string): Promise<Subtopic[]> {
        const cacheKey = `subtopics_for_topic_${topicId}`;
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        this.cacheService.incrementDbCall('getSubtopicsForTopic');
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('subtopics')
            .select('*')
            .eq('topic_id', topicId)
            .eq('user_id', user!.id)
            .order('order', { ascending: true });
        if (error) throw error;

        this.cacheService.set(cacheKey, data as Subtopic[]);
        return data as Subtopic[];
    }

    async addSubtopic(topicId: string, title: string): Promise<Subtopic> {
        const { data: { user } } = await supabase.auth.getUser();

        // Get current count for ordering
        const { count, error: countErr } = await supabase
            .from('subtopics')
            .select('*', { count: 'exact', head: true })
            .eq('topic_id', topicId)
            .eq('user_id', user!.id);
        if (countErr) throw countErr;

        const { data, error } = await supabase
            .from('subtopics')
            .insert({
                user_id: user!.id,
                topic_id: topicId,
                title,
                completed: false,
                notes: '',
                order: count ?? 0
            })
            .select()
            .single();
        if (error) throw error;
        
        this.cacheService.clear(); // Clear all cache to refresh subjects list and subtopics
        return data as Subtopic;
    }

    async toggleSubtopic(id: string, completed: boolean): Promise<void> {
        this.cacheService.incrementDbCall('toggleSubtopic');
        const { error } = await supabase
            .from('subtopics')
            .update({ completed })
            .eq('id', id);
        if (error) throw error;
        
        this.cacheService.clear();

        if (completed) {
            this.activityService.logActivity();
        }
    }

    async updateSubtopicNotes(id: string, notes: string): Promise<void> {
        this.cacheService.incrementDbCall('updateSubtopicNotes');
        const { error } = await supabase
            .from('subtopics')
            .update({ notes })
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clear();
    }

    async deleteSubtopic(id: string): Promise<void> {
        this.cacheService.incrementDbCall('deleteSubtopic');
        const { error } = await supabase
            .from('subtopics')
            .delete()
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clear();
    }

    async updateTopicProgress(topicId: string, completed: boolean): Promise<void> {
        this.cacheService.incrementDbCall('updateTopicProgress');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('user_progress')
            .upsert({
                user_id: user!.id,
                topic_id: topicId,
                completed,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,topic_id' });
        if (error) throw error;
        this.cacheService.clear();
    }
}
