// src/app/core/services/subjects.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Subject, TopicWithProgress, Subtopic } from '../models';

@Injectable({ providedIn: 'root' })
export class SubjectsService {

    async getAll(): Promise<Subject[]> {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data as Subject[];
    }

    async getSubjectById(id: string): Promise<Subject> {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Subject;
    }

    async getTopicsForSubject(subjectId: string): Promise<TopicWithProgress[]> {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .eq('subject_id', subjectId)
            .order('created_at', { ascending: true });
        if (topErr) throw topErr;

        const topicIds = (topics ?? []).map(t => t.id);
        let progress: any[] = [];
        let allSubtopics: any[] = [];

        if (topicIds.length > 0) {
            const { data: prog, error: progErr } = await supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', user!.id)
                .in('topic_id', topicIds);
            if (progErr) throw progErr;
            progress = prog ?? [];

            // Batch-fetch all subtopics for these topics in one query
            const { data: subs, error: subErr } = await supabase
                .from('subtopics')
                .select('*')
                .eq('user_id', user!.id)
                .in('topic_id', topicIds)
                .order('order', { ascending: true });
            if (subErr) throw subErr;
            allSubtopics = subs ?? [];
        }

        return (topics ?? []).map(t => {
            const p = progress.find(pr => pr.topic_id === t.id);
            const topicSubtopics = allSubtopics.filter(st => st.topic_id === t.id);
            return {
                ...t,
                completed: p?.completed ?? false,
                notes: p?.notes ?? '',
                subtopics: topicSubtopics as Subtopic[]
            };
        });
    }

    async create(name: string, color: string): Promise<Subject> {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('subjects')
            .insert({ name, color, user_id: user!.id })
            .select()
            .single();
        if (error) throw error;
        return data as Subject;
    }

    async update(id: string, name: string, color: string): Promise<void> {
        const { error } = await supabase
            .from('subjects')
            .update({ name, color })
            .eq('id', id);
        if (error) throw error;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('subjects')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
}
