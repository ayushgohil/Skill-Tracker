import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Topic, TopicWithProgress, Depth, SubjectWithTopics, Subtopic } from '../models';
import { ActivityService } from './activity.service';
import { CacheService } from './cache.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TopicsService {

    constructor(
        private activityService: ActivityService,
        private cacheService: CacheService,
        private auth: AuthService
    ) {}

    async getSubjectsWithTopics(): Promise<SubjectWithTopics[]> {
        const cacheKey = 'subjects_with_topics';
        const cached = this.cacheService.get(cacheKey);
        if (cached) return cached;

        const userId = await this.auth.ensureUserId();

        this.cacheService.incrementDbCall('getSubjectsWithTopics_batch');

        // Batch-fetch subjects, topics, progress, subtopics, and members in PARALLEL
        const [subjectsRes, topicsRes, progRes, subTopRes, membersRes] = await Promise.all([
            supabase
                .from('subjects')
                .select('*')
                .order('order', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: true }),
            supabase
                .from('topics')
                .select('id, user_id, subject_id, title, depth, starred, order, created_at')
                .order('order', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: true }),
            supabase
                .from('user_progress')
                .select('topic_id, completed')
                .eq('user_id', userId),
            supabase
                .from('subtopics')
                .select('id, topic_id, completed')
                .order('order', { ascending: true }),
            supabase
                .from('subject_members')
                .select('subject_id, user_id, role, joined_at')
        ]);

        if (subjectsRes.error) throw subjectsRes.error;
        if (topicsRes.error) throw topicsRes.error;
        if (progRes.error) throw progRes.error;
        if (subTopRes.error) throw subTopRes.error;

        const subjects = subjectsRes.data ?? [];
        const topics = topicsRes.data ?? [];
        const progress = progRes.data ?? [];
        const allSubtopics = subTopRes.data ?? [];
        const members = membersRes.data ?? [];

        const topicIds = topics.map(t => t.id);

        // Collect partner user IDs to fetch their display names and progress
        const partnerUserIds = new Set<string>();
        const subjectPartnerMap = new Map<string, { partnerId: string; role: 'owner' | 'partner' }>();

        for (const sub of subjects) {
            const isOwner = sub.user_id === userId;
            if (isOwner) {
                const partnerMember = members.find((m: any) => m.subject_id === sub.id && m.role === 'partner');
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

        // Fetch partner profiles and progress in parallel if shared subjects exist
        const partnerProfileMap = new Map<string, string>();
        const partnerProgressMap = new Map<string, boolean>();

        if (partnerUserIds.size > 0 && topicIds.length > 0) {
            const partnerIds = Array.from(partnerUserIds);
            const [profilesRes, partnerProgRes] = await Promise.all([
                supabase.rpc('get_partner_profiles', { p_partner_ids: partnerIds }),
                supabase
                    .from('user_progress')
                    .select('user_id, topic_id, completed')
                    .in('user_id', partnerIds)
                    .in('topic_id', topicIds)
            ]);

            for (const p of (profilesRes.data ?? [])) {
                partnerProfileMap.set(p.id, p.display_name);
            }
            for (const pp of (partnerProgRes.data ?? [])) {
                partnerProgressMap.set(`${pp.user_id}_${pp.topic_id}`, !!pp.completed);
            }
        }

        const result = subjects.map(sub => {
            const isOwner = sub.user_id === userId;
            const partnerInfo = subjectPartnerMap.get(sub.id);
            const isShared = !!partnerInfo;

            const partnerObj = isShared ? {
                id: partnerInfo.partnerId,
                display_name: partnerProfileMap.get(partnerInfo.partnerId) || (isOwner ? 'Study Partner' : 'Subject Creator'),
                role: partnerInfo.role
            } : null;

            const subTopics: TopicWithProgress[] = topics
                .filter(t => t.subject_id === sub.id)
                .map(t => {
                    const p = progress.find(pr => pr.topic_id === t.id);
                    const topicSubtopics = allSubtopics.filter(st => st.topic_id === t.id);
                    const partnerDone = isShared ? partnerProgressMap.get(`${partnerInfo.partnerId}_${t.id}`) ?? false : undefined;

                    return {
                        ...t,
                        completed: p?.completed ?? false,
                        notes: '',
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
        // Pre-warm individual subject caches so navigating to any subject is instant (0ms)
        for (const sub of result) {
            this.cacheService.set(`subject_${sub.id}`, sub);
        }
        return result;
    }

    async addTopic(subjectId: string, title: string, depth: Depth): Promise<Topic> {
        this.cacheService.incrementDbCall('addTopic');
        const userId = await this.auth.ensureUserId();

        // Get current topic count in this subject for ordering across both partners
        const { count } = await supabase
            .from('topics')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId);

        const { data, error } = await supabase
            .from('topics')
            .insert({ subject_id: subjectId, title, depth, user_id: userId, order: count ?? 0 })
            .select()
            .single();
        if (error) throw error;
        this.cacheService.clearSubjects();
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

        this.cacheService.clearSubjects();
    }

    async updateTopic(id: string, title: string, depth: Depth): Promise<void> {
        this.cacheService.incrementDbCall('updateTopic');
        const { error } = await supabase
            .from('topics')
            .update({ title, depth })
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clearSubjects();
    }

    async deleteTopic(id: string): Promise<void> {
        this.cacheService.incrementDbCall('deleteTopic');
        const { error } = await supabase
            .from('topics')
            .delete()
            .eq('id', id);
        if (error) throw error;
        this.cacheService.clearSubjects();
    }

    async upsertProgress(topicId: string, completed: boolean, notes: string): Promise<void> {
        this.cacheService.incrementDbCall('upsertProgress');
        const userId = await this.auth.ensureUserId();
        const { error } = await supabase
            .from('user_progress')
            .upsert({
                user_id: userId,
                topic_id: topicId,
                completed,
                notes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,topic_id' });
        if (error) throw error;
        
        this.cacheService.clearSubjects();

        // Sync activity after every toggle — syncActivity recomputes today's count from the DB,
        // so it's idempotent and accurate regardless of how many times a topic is toggled.
        this.activityService.syncActivity();
    }
}
