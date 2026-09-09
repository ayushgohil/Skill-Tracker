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
            .order('order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        if (subErr) throw subErr;

        this.cacheService.incrementDbCall('getSubjectsWithTopics_topics');
        const { data: topics, error: topErr } = await supabase
            .from('topics')
            .select('*')
            .order('order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        if (topErr) throw topErr;

        this.cacheService.incrementDbCall('getSubjectsWithTopics_progress');
        const { data: progress, error: progErr } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user!.id);
        if (progErr) throw progErr;

        const topicIds = (topics ?? []).map(t => t.id);

        // Batch-fetch all subtopics for these topics (for both users if shared)
        this.cacheService.incrementDbCall('getSubjectsWithTopics_subtopics');
        const { data: allSubtopics, error: subTopErr } = topicIds.length > 0
            ? await supabase
                .from('subtopics')
                .select('*')
                .in('topic_id', topicIds)
                .order('order', { ascending: true })
            : { data: [], error: null };
        if (subTopErr) throw subTopErr;

        // Fetch subject_members to identify study partners
        const subjectIds = (subjects ?? []).map(s => s.id);
        const { data: members } = subjectIds.length > 0
            ? await supabase
                .from('subject_members')
                .select('subject_id, user_id, role, joined_at')
                .in('subject_id', subjectIds)
            : { data: [] };

        // Collect partner user IDs to fetch their display names and progress
        const partnerUserIds = new Set<string>();
        const subjectPartnerMap = new Map<string, { partnerId: string; role: 'owner' | 'partner' }>();

        for (const sub of (subjects ?? [])) {
            const isOwner = sub.user_id === user!.id;
            if (isOwner) {
                const partnerMember = (members ?? []).find(m => m.subject_id === sub.id && m.role === 'partner');
                if (partnerMember) {
                    partnerUserIds.add(partnerMember.user_id);
                    subjectPartnerMap.set(sub.id, { partnerId: partnerMember.user_id, role: 'partner' });
                }
            } else {
                // Current user is the partner, so the other person is the owner
                partnerUserIds.add(sub.user_id);
                subjectPartnerMap.set(sub.id, { partnerId: sub.user_id, role: 'owner' });
            }
        }

        // Fetch partner profiles securely via RPC (never exposes private tokens)
        const partnerProfileMap = new Map<string, string>();
        if (partnerUserIds.size > 0) {
            const { data: profiles } = await supabase.rpc('get_partner_profiles', {
                p_partner_ids: Array.from(partnerUserIds)
            });
            for (const p of (profiles ?? [])) {
                partnerProfileMap.set(p.id, p.display_name);
            }
        }

        // Fetch partner progress for all topics in these subjects
        const partnerProgressMap = new Map<string, boolean>();
        if (partnerUserIds.size > 0 && topicIds.length > 0) {
            const { data: partnerProgs } = await supabase
                .from('user_progress')
                .select('user_id, topic_id, completed')
                .in('user_id', Array.from(partnerUserIds))
                .in('topic_id', topicIds);
            for (const pp of (partnerProgs ?? [])) {
                partnerProgressMap.set(`${pp.user_id}_${pp.topic_id}`, !!pp.completed);
            }
        }

        const result = (subjects ?? []).map(sub => {
            const isOwner = sub.user_id === user!.id;
            const partnerInfo = subjectPartnerMap.get(sub.id);
            const isShared = !!partnerInfo;

            const partnerObj = isShared ? {
                id: partnerInfo.partnerId,
                display_name: partnerProfileMap.get(partnerInfo.partnerId) || (isOwner ? 'Study Partner' : 'Subject Creator'),
                role: partnerInfo.role
            } : null;

            const subTopics: TopicWithProgress[] = (topics ?? [])
                .filter(t => t.subject_id === sub.id)
                .map(t => {
                    const p = (progress ?? []).find(pr => pr.topic_id === t.id);
                    const topicSubtopics = (allSubtopics ?? []).filter(st => st.topic_id === t.id);
                    const partnerDone = isShared ? partnerProgressMap.get(`${partnerInfo.partnerId}_${t.id}`) ?? false : undefined;

                    return {
                        ...t,
                        completed: p?.completed ?? false,
                        notes: p?.notes ?? '',
                        subtopics: topicSubtopics as Subtopic[],
                        partner_completed: partnerDone
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

            // Partner percent (partner progress is tracked at the topic level)
            let partnerPercent = 0;
            if (isShared && subTopics.length > 0) {
                const partnerCompletedCount = subTopics.reduce((sum, t) => {
                    return sum + (t.partner_completed ? 1 : 0);
                }, 0);
                partnerPercent = Math.round((partnerCompletedCount / subTopics.length) * 100);
            }

            return {
                ...sub,
                is_shared: isShared,
                is_owner: isOwner,
                partner: partnerObj,
                partner_percent: partnerPercent,
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

        // Get current topic count in this subject for ordering across both partners
        const { count } = await supabase
            .from('topics')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId);

        const { data, error } = await supabase
            .from('topics')
            .insert({ subject_id: subjectId, title, depth, user_id: user!.id, order: count ?? 0 })
            .select()
            .single();
        if (error) throw error;
        this.cacheService.clear('subjects_with_topics');
        this.cacheService.clear(`topics_for_subject_${subjectId}`);
        return data as Topic;
    }

    async updateTopicsOrder(orderedTopics: Topic[]): Promise<void> {
        this.cacheService.incrementDbCall('updateTopicsOrder');
        const updates = orderedTopics.map((t, index) =>
            supabase
                .from('topics')
                .update({ order: index })
                .eq('id', t.id)
        );
        const results = await Promise.all(updates);
        for (const res of results) {
            if (res.error) throw res.error;
        }

        this.cacheService.clear();
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
        this.cacheService.clear();

        // Sync activity after every toggle — syncActivity SETs the real count from DB,
        // so it's idempotent and accurate regardless of how many times a topic is toggled.
        this.activityService.syncActivity();
    }
}