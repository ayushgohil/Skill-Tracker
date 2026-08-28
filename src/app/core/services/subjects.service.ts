// src/app/core/services/subjects.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Subject, TopicWithProgress, Subtopic } from '../models';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class SubjectsService {

    constructor(private cacheService: CacheService) {}

    async getAll(): Promise<Subject[]> {
        const cacheKey = 'subjects_all';
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        this.cacheService.incrementDbCall('getAllSubjects');
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        if (error) throw error;
        
        this.cacheService.set(cacheKey, data as Subject[]);
        return data as Subject[];
    }

    async getSubjectById(id: string): Promise<Subject> {
        const cacheKey = `subject_${id}`;
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        this.cacheService.incrementDbCall('getSubjectById');
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;

        this.cacheService.set(cacheKey, data as Subject);
        return data as Subject;
    }

    async getTopicsForSubject(subjectId: string): Promise<TopicWithProgress[]> {
        const cacheKey = `topics_for_subject_${subjectId}`;
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        const { data: { user } } = await supabase.auth.getUser();

        this.cacheService.incrementDbCall('getTopicsForSubject');
        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .eq('subject_id', subjectId)
            .order('order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        if (topErr) throw topErr;

        const topicIds = (topics ?? []).map(t => t.id);
        let progress: any[] = [];
        let allSubtopics: any[] = [];

        if (topicIds.length > 0) {
            this.cacheService.incrementDbCall('getTopicsForSubject_progress');
            const { data: prog, error: progErr } = await supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', user!.id)
                .in('topic_id', topicIds);
            if (progErr) throw progErr;
            progress = prog ?? [];

            // Batch-fetch all subtopics for these topics in one query
            this.cacheService.incrementDbCall('getTopicsForSubject_subtopics');
            const { data: subs, error: subErr } = await supabase
                .from('subtopics')
                .select('*')
                .eq('user_id', user!.id)
                .in('topic_id', topicIds)
                .order('order', { ascending: true });
            if (subErr) throw subErr;
            allSubtopics = subs ?? [];
        }

        const result = (topics ?? []).map(t => {
            const p = progress.find(pr => pr.topic_id === t.id);
            const topicSubtopics = allSubtopics.filter(st => st.topic_id === t.id);
            return {
                ...t,
                completed: p?.completed ?? false,
                notes: p?.notes ?? '',
                subtopics: topicSubtopics as Subtopic[]
            };
        });

        this.cacheService.set(cacheKey, result);
        return result;
    }

    async create(name: string, color: string): Promise<Subject> {
        this.cacheService.incrementDbCall('createSubject');
        const { data: { user } } = await supabase.auth.getUser();

        // Get current count for ordering
        const { count } = await supabase
            .from('subjects')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user!.id);

        const { data, error } = await supabase
            .from('subjects')
            .insert({ name, color, user_id: user!.id, order: count ?? 0 })
            .select()
            .single();
        if (error) throw error;

        this.cacheService.clear('subjects_all');
        this.cacheService.clear('subjects_with_topics'); // also invalidate TopicsService cache
        return data as Subject;
    }

    async update(id: string, name: string, color: string): Promise<void> {
        this.cacheService.incrementDbCall('updateSubject');
        const { error } = await supabase
            .from('subjects')
            .update({ name, color })
            .eq('id', id);
        if (error) throw error;
        
        this.cacheService.clear('subjects_all');
        this.cacheService.clear(`subject_${id}`);
        this.cacheService.clear('subjects_with_topics');
    }

    async updateSubjectsOrder(orderedSubjects: Subject[]): Promise<void> {
        this.cacheService.incrementDbCall('updateSubjectsOrder');
        const updates = orderedSubjects.map((s, index) =>
            supabase
                .from('subjects')
                .update({ order: index })
                .eq('id', s.id)
        );
        const results = await Promise.all(updates);
        for (const res of results) {
            if (res.error) throw res.error;
        }

        this.cacheService.clear('subjects_all');
        this.cacheService.clear('subjects_with_topics');
    }

    async delete(id: string): Promise<void> {
        this.cacheService.incrementDbCall('deleteSubject');
        const { error } = await supabase
            .from('subjects')
            .delete()
            .eq('id', id);
        if (error) throw error;

        this.cacheService.clear('subjects_all');
        this.cacheService.clear(`subject_${id}`);
        this.cacheService.clear(`topics_for_subject_${id}`);
        this.cacheService.clear('subjects_with_topics');
    }
}

