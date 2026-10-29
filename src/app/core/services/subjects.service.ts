// src/app/core/services/subjects.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { fetchAllRowsForIds } from '../supabase-paging';
import { Subject, TopicWithProgress, Subtopic } from '../models';
import { CacheService } from './cache.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SubjectsService {

    constructor(private cacheService: CacheService, private auth: AuthService) {}

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

    async getSubjectById(id: string, forceRefresh = false): Promise<Subject> {
        const cacheKey = `subject_${id}`;
        if (!forceRefresh) {
            const cached = this.cacheService.get(cacheKey);
            if (cached) return cached;
        }

        const userId = await this.auth.ensureUserId();

        this.cacheService.incrementDbCall('getSubjectById');
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;

        const subject = data as Subject;
        const isOwner = subject.user_id === userId;

        // Check if this subject has a study partner
        let partnerObj = null;
        if (isOwner) {
            const { data: member } = await supabase
                .from('subject_members')
                .select('user_id, role, joined_at')
                .eq('subject_id', id)
                .eq('role', 'partner')
                .maybeSingle();

            if (member) {
                const { data: profiles } = await supabase.rpc('get_partner_profiles', {
                    p_partner_ids: [member.user_id]
                });

                partnerObj = {
                    id: member.user_id,
                    display_name: profiles?.[0]?.display_name || 'Study Partner',
                    role: 'partner' as const,
                    joined_at: member.joined_at
                };
            }
        } else {
            const { data: profiles } = await supabase.rpc('get_partner_profiles', {
                p_partner_ids: [subject.user_id]
            });

            partnerObj = {
                id: subject.user_id,
                display_name: profiles?.[0]?.display_name || 'Subject Creator',
                role: 'owner' as const
            };
        }

        const enrichedSubject: Subject = {
            ...subject,
            is_owner: isOwner,
            is_shared: !!partnerObj,
            partner: partnerObj
        };

        this.cacheService.set(cacheKey, enrichedSubject);
        return enrichedSubject;
    }

    async getTopicsForSubject(subjectId: string, forceRefresh = false): Promise<TopicWithProgress[]> {
        const cacheKey = `topics_for_subject_${subjectId}`;
        if (!forceRefresh) {
            const cached = this.cacheService.get(cacheKey);
            if (cached) return cached;
        }

        const userId = await this.auth.ensureUserId();

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
        let partnerProgressMap = new Map<string, { completed: boolean; notes: string }>();

        if (topicIds.length > 0) {
            // Batch-fetch progress, subtopics, subject info, and partner membership in PARALLEL
            const [progRows, subRows, subjectRes, partnerMemberRes] = await Promise.all([
                // Ids go in small groups and rows come page by page (see supabase-paging.ts)
                fetchAllRowsForIds<any>(topicIds, (idChunk, from, to) => supabase
                    .from('user_progress')
                    .select('*', { count: 'exact' })
                    .eq('user_id', userId)
                    .in('topic_id', idChunk)
                    .order('topic_id', { ascending: true })
                    .range(from, to)),
                fetchAllRowsForIds<any>(topicIds, (idChunk, from, to) => supabase
                    .from('subtopics')
                    .select('*', { count: 'exact' })
                    .in('topic_id', idChunk)
                    .order('order', { ascending: true })
                    .order('id', { ascending: true })
                    .range(from, to)),
                supabase
                    .from('subjects')
                    .select('user_id')
                    .eq('id', subjectId)
                    .single(),
                supabase
                    .from('subject_members')
                    .select('user_id')
                    .eq('subject_id', subjectId)
                    .eq('role', 'partner')
                    .maybeSingle()
            ]);

            progress = progRows;
            // Chunks are read one after another, so put the subtopics back in their saved order
            allSubtopics = subRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            const subjectData = subjectRes.data;
            if (subjectData) {
                let partnerUserId: string | null = null;
                if (subjectData.user_id === userId) {
                    if (partnerMemberRes.data) partnerUserId = partnerMemberRes.data.user_id;
                } else {
                    partnerUserId = subjectData.user_id;
                }

                if (partnerUserId) {
                    const partnerProgs = await fetchAllRowsForIds<any>(topicIds, (idChunk, from, to) => supabase
                        .from('user_progress')
                        .select('topic_id, completed, notes', { count: 'exact' })
                        .eq('user_id', partnerUserId)
                        .in('topic_id', idChunk)
                        .order('topic_id', { ascending: true })
                        .range(from, to)).catch(() => [] as any[]);

                    for (const pp of partnerProgs) {
                        partnerProgressMap.set(pp.topic_id, {
                            completed: !!pp.completed,
                            notes: pp.notes || ''
                        });
                    }
                }
            }
        }

        const result = (topics ?? []).map(t => {
            const p = progress.find(pr => pr.topic_id === t.id);
            const topicSubtopics = allSubtopics.filter(st => st.topic_id === t.id);
            const partnerP = partnerProgressMap.get(t.id);

            return {
                ...t,
                completed: p?.completed ?? false,
                notes: p?.notes ?? '',
                subtopics: topicSubtopics as Subtopic[],
                partner_completed: partnerP?.completed,
                partner_notes: partnerP?.notes
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

