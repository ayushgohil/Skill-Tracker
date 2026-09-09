import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { CacheService } from './cache.service';
import { InvitePreview, SubjectMember, SubjectPartnerInfo, UserProgress } from '../models';

@Injectable({ providedIn: 'root' })
export class CollaborationService {

    constructor(private cacheService: CacheService) { }

    /**
     * Generates or retrieves an existing active invite link for a subject.
     */
    async createOrGetInvite(subjectId: string): Promise<{ inviteCode: string; inviteUrl: string; expiresAt: string }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if an active, unexpired invite already exists
        const { data: existing, error: findErr } = await supabase
            .from('subject_invites')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('inviter_id', user.id)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (!findErr && existing && existing.length > 0) {
            const inv = existing[0];
            return {
                inviteCode: inv.invite_code,
                inviteUrl: this.buildJoinUrl(inv.invite_code),
                expiresAt: inv.expires_at
            };
        }

        // Generate clean random 8-character uppercase code (e.g. SKILL-8A2F)
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        const inviteCode = `ST-${randomPart}`;

        const { data: newInvite, error: insertErr } = await supabase
            .from('subject_invites')
            .insert({
                subject_id: subjectId,
                inviter_id: user.id,
                invite_code: inviteCode,
                status: 'active'
            })
            .select()
            .single();

        if (insertErr) throw insertErr;

        return {
            inviteCode: newInvite.invite_code,
            inviteUrl: this.buildJoinUrl(newInvite.invite_code),
            expiresAt: newInvite.expires_at
        };
    }

    /**
     * Finds an existing active, unexpired invite link for a subject without creating one.
     */
    async getActiveInvite(subjectId: string): Promise<{ inviteCode: string; inviteUrl: string; expiresAt: string } | null> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: existing, error } = await supabase
            .from('subject_invites')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('inviter_id', user.id)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !existing || existing.length === 0) {
            return null;
        }

        const inv = existing[0];
        return {
            inviteCode: inv.invite_code,
            inviteUrl: this.buildJoinUrl(inv.invite_code),
            expiresAt: inv.expires_at
        };
    }

    /**
     * Preview subject info before joining.
     */
    async getInvitePreview(code: string): Promise<InvitePreview> {
        const { data, error } = await supabase.rpc('get_invite_preview', {
            p_invite_code: code.trim()
        });

        if (error) {
            throw new Error(error.message);
        }

        return data as InvitePreview;
    }

    /**
     * Accepts an invitation to become a study partner on the subject.
     */
    async acceptInvite(code: string): Promise<{ success: boolean; subject_id?: string; error?: string }> {
        const { data, error } = await supabase.rpc('join_subject_by_code', {
            p_invite_code: code.trim()
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (data?.error) {
            return { success: false, error: data.error, subject_id: data.subject_id };
        }

        // Invalidate all subject caches so the new shared subject appears immediately
        this.cacheService.clear();

        return { success: true, subject_id: data.subject_id };
    }

    /**
     * Fetches the study partner info for a subject.
     * Returns null if the subject is not shared.
     */
    async getSubjectPartner(subjectId: string, subjectOwnerId: string, currentUserId: string): Promise<SubjectPartnerInfo | null> {
        // If current user is the owner, look for the partner in subject_members
        if (currentUserId === subjectOwnerId) {
            const { data: members, error } = await supabase
                .from('subject_members')
                .select('user_id, role, joined_at')
                .eq('subject_id', subjectId)
                .eq('role', 'partner')
                .limit(1);

            if (error || !members || members.length === 0) return null;

            const partnerMember = members[0];
            const { data: profiles } = await supabase.rpc('get_partner_profiles', {
                p_partner_ids: [partnerMember.user_id]
            });

            const partnerName = profiles?.[0]?.display_name || 'Study Partner';

            return {
                id: partnerMember.user_id,
                display_name: partnerName,
                role: 'partner',
                joined_at: partnerMember.joined_at
            };
        } else {
            // Current user is the partner, so the other person is the owner
            const { data: profiles } = await supabase.rpc('get_partner_profiles', {
                p_partner_ids: [subjectOwnerId]
            });

            const ownerName = profiles?.[0]?.display_name || 'Subject Creator';

            return {
                id: subjectOwnerId,
                display_name: ownerName,
                role: 'owner'
            };
        }
    }

    /**
     * Fetches the partner's completion status and notes for a list of topics.
     */
    async getPartnerProgressForTopics(partnerUserId: string, topicIds: string[]): Promise<Map<string, { completed: boolean; notes: string }>> {
        const progressMap = new Map<string, { completed: boolean; notes: string }>();
        if (!partnerUserId || topicIds.length === 0) return progressMap;

        const { data, error } = await supabase
            .from('user_progress')
            .select('topic_id, completed, notes')
            .eq('user_id', partnerUserId)
            .in('topic_id', topicIds);

        if (error) {
            console.error('Failed to fetch partner progress:', error);
            return progressMap;
        }

        for (const row of (data ?? [])) {
            progressMap.set(row.topic_id, {
                completed: !!row.completed,
                notes: row.notes || ''
            });
        }

        return progressMap;
    }

    /**
     * Allows a partner to leave a shared subject.
     */
    async leaveSubject(subjectId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('subject_members')
            .delete()
            .eq('subject_id', subjectId)
            .eq('user_id', user.id);

        if (error) throw error;
        this.cacheService.clear();
    }

    /**
     * Allows the subject owner to remove a study partner.
     */
    async removePartner(subjectId: string, partnerUserId: string): Promise<void> {
        const { error } = await supabase
            .from('subject_members')
            .delete()
            .eq('subject_id', subjectId)
            .eq('user_id', partnerUserId);

        if (error) throw error;
        this.cacheService.clear();
    }

    private buildJoinUrl(code: string): string {
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/join/${code}`;
        }
        return `/join/${code}`;
    }
}
