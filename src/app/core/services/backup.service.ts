// src/app/core/services/backup.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { GoogleDriveService } from './google-drive.service';
import { CacheService } from './cache.service';
import { ActivityService } from './activity.service';
import {
    BackupData,
    BackupMetadata,
    DriveBackupFile,
    RestoreResult,
    Subject,
    Topic,
    Subtopic,
    UserProgress,
    WeeklyGoal,
    WeeklyReview,
    ActivityLogItem,
    TopicMediaItem
} from '../models';

@Injectable({ providedIn: 'root' })
export class BackupService {

    constructor(
        private googleDrive: GoogleDriveService,
        private cacheService: CacheService,
        private activityService: ActivityService
    ) { }

    /**
     * Generate standard timestamped filename for backup
     */
    generateBackupFileName(date: Date = new Date()): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `skilltracker-backup-${y}-${m}-${d}_${hh}-${mm}-${ss}.json`;
    }

    /**
     * Gather and export all user data from all database tables into a strongly-typed JSON structure
     */
    async exportAllUserData(): Promise<BackupData> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User is not authenticated');

        const [
            profileRes,
            subjectsRes,
            topicsRes,
            subtopicsRes,
            progressRes,
            goalsRes,
            reviewsRes,
            activityRes,
            mediaRes
        ] = await Promise.all([
            supabase.from('profiles').select('id, display_name, created_at').eq('id', user.id).maybeSingle(),
            supabase.from('subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
            supabase.from('topics').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
            supabase.from('subtopics').select('*').eq('user_id', user.id).order('order', { ascending: true }),
            supabase.from('user_progress').select('*').eq('user_id', user.id),
            supabase.from('weekly_goals').select('*').eq('user_id', user.id),
            supabase.from('weekly_reviews').select('*').eq('user_id', user.id),
            supabase.from('activity_logs').select('*').eq('user_id', user.id).order('date', { ascending: true }),
            supabase.from('topic_media').select('*').eq('user_id', user.id)
        ]);

        if (subjectsRes.error) throw subjectsRes.error;
        if (topicsRes.error) throw topicsRes.error;
        if (subtopicsRes.error) throw subtopicsRes.error;
        if (progressRes.error) throw progressRes.error;
        if (goalsRes.error) throw goalsRes.error;
        if (reviewsRes.error) throw reviewsRes.error;

        const subjects: Subject[] = subjectsRes.data ?? [];
        const topics: Topic[] = topicsRes.data ?? [];
        const subtopics: Subtopic[] = subtopicsRes.data ?? [];
        const user_progress: UserProgress[] = progressRes.data ?? [];
        const weekly_goals: WeeklyGoal[] = goalsRes.data ?? [];
        const weekly_reviews: WeeklyReview[] = reviewsRes.data ?? [];
        const activity_logs: ActivityLogItem[] = activityRes.data ?? [];
        const topic_media: TopicMediaItem[] = mediaRes.data ?? [];

        const metadata: BackupMetadata = {
            version: 1,
            appName: 'NextLyr SkillTracker',
            exportedAt: new Date().toISOString(),
            userId: user.id,
            userEmail: user.email,
            summary: {
                totalSubjects: subjects.length,
                totalTopics: topics.length,
                totalSubtopics: subtopics.length,
                totalProgressRecords: user_progress.length,
                totalWeeklyGoals: weekly_goals.length,
                totalWeeklyReviews: weekly_reviews.length,
                totalActivityLogs: activity_logs.length,
                totalMediaAttachments: topic_media.length
            }
        };

        return {
            metadata,
            profile: profileRes.data ?? undefined,
            subjects,
            topics,
            subtopics,
            user_progress,
            weekly_goals,
            weekly_reviews,
            activity_logs,
            topic_media
        };
    }

    /**
     * Download backup data directly to local disk as a formatted JSON file
     */
    downloadBackupFile(backupData: BackupData, customFileName?: string): void {
        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const fileName = customFileName || this.generateBackupFileName(new Date(backupData.metadata.exportedAt || Date.now()));

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Upload backup data directly into user's Google Drive folder: NextLyr SkillTracker/Backups
     */
    async backupToGoogleDrive(backupData: BackupData): Promise<{ fileId: string; fileName: string; mimeType: string }> {
        const fileName = this.generateBackupFileName(new Date(backupData.metadata.exportedAt || Date.now()));
        const jsonStr = JSON.stringify(backupData, null, 2);
        return await this.googleDrive.uploadJsonBackup(fileName, jsonStr);
    }

    /**
     * List all backups stored on Google Drive
     */
    async listDriveBackups(): Promise<DriveBackupFile[]> {
        return await this.googleDrive.listBackupFiles();
    }

    /**
     * Fetch backup JSON from Google Drive by fileId
     */
    async getBackupFromDrive(fileId: string): Promise<BackupData> {
        const text = await this.googleDrive.getJsonFileContent(fileId);
        const data = JSON.parse(text);
        this.validateBackupData(data);
        return data as BackupData;
    }

    /**
     * Parse and validate backup JSON from uploaded local File
     */
    async parseBackupFile(file: File): Promise<BackupData> {
        const text = await file.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('Invalid JSON file format');
        }
        this.validateBackupData(data);
        return data as BackupData;
    }

    /**
     * Validate schema of backup data
     */
    validateBackupData(data: any): boolean {
        if (!data || typeof data !== 'object') {
            throw new Error('Backup data is empty or invalid.');
        }
        if (!Array.isArray(data.subjects) || !Array.isArray(data.topics)) {
            throw new Error('Backup file is missing required tables (subjects/topics).');
        }
        return true;
    }

    /**
     * Fully restore and revert user data from BackupData
     * Step-by-step transaction with progress callbacks
     */
    async restoreData(
        backupData: BackupData,
        onProgress?: (stepIndex: number, stepLabel: string) => void
    ): Promise<RestoreResult> {
        this.validateBackupData(backupData);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User is not authenticated');

        const updateStep = (index: number, label: string) => {
            if (onProgress) onProgress(index, label);
        };

        // ── 1. Wipe existing user records in dependency order ────
        updateStep(0, 'Clearing existing data');
        await Promise.all([
            supabase.from('activity_logs').delete().eq('user_id', user.id),
            supabase.from('weekly_reviews').delete().eq('user_id', user.id),
            supabase.from('weekly_goals').delete().eq('user_id', user.id),
            supabase.from('topic_media').delete().eq('user_id', user.id),
            supabase.from('user_progress').delete().eq('user_id', user.id),
            supabase.from('subtopics').delete().eq('user_id', user.id)
        ]);
        // Delete topics and subjects after child tables are cleared
        await supabase.from('topics').delete().eq('user_id', user.id);
        await supabase.from('subjects').delete().eq('user_id', user.id);

        // ── ID Mapping maps ─────────────────────────────────────
        const subjectIdMap = new Map<string, string>();
        const topicIdMap = new Map<string, string>();

        // ── 2. Restore Subjects ──────────────────────────────────
        updateStep(1, 'Restoring subjects');
        const subjectsToInsert = (backupData.subjects ?? []).map(s => {
            const newId = crypto.randomUUID();
            subjectIdMap.set(s.id, newId);
            return {
                id: newId,
                user_id: user.id,
                name: s.name,
                color: s.color || '#3b82f6',
                created_at: s.created_at || new Date().toISOString()
            };
        });

        if (subjectsToInsert.length > 0) {
            const { error } = await supabase.from('subjects').insert(subjectsToInsert);
            if (error) throw new Error(`Failed to restore subjects: ${error.message}`);
        }

        // ── 3. Restore Topics ────────────────────────────────────
        updateStep(2, 'Restoring topics');
        const topicsToInsert = (backupData.topics ?? []).map(t => {
            const newId = crypto.randomUUID();
            topicIdMap.set(t.id, newId);
            const mappedSubjectId = subjectIdMap.get(t.subject_id) || t.subject_id;
            return {
                id: newId,
                user_id: user.id,
                subject_id: mappedSubjectId,
                title: t.title,
                depth: t.depth || 'shallow',
                starred: t.starred || false,
                created_at: t.created_at || new Date().toISOString()
            };
        });

        if (topicsToInsert.length > 0) {
            const { error } = await supabase.from('topics').insert(topicsToInsert);
            if (error) throw new Error(`Failed to restore topics: ${error.message}`);
        }

        // ── 4. Restore Subtopics ─────────────────────────────────
        updateStep(3, 'Restoring subtopics');
        const subtopicsToInsert = (backupData.subtopics ?? []).map(st => {
            const mappedTopicId = topicIdMap.get(st.topic_id) || st.topic_id;
            return {
                id: crypto.randomUUID(),
                user_id: user.id,
                topic_id: mappedTopicId,
                title: st.title,
                completed: !!st.completed,
                notes: st.notes || '',
                order: typeof st.order === 'number' ? st.order : 0,
                created_at: st.created_at || new Date().toISOString()
            };
        });

        if (subtopicsToInsert.length > 0) {
            const { error } = await supabase.from('subtopics').insert(subtopicsToInsert);
            if (error) throw new Error(`Failed to restore subtopics: ${error.message}`);
        }

        // ── 5. Restore User Progress & Notes ─────────────────────
        updateStep(4, 'Restoring progress & checkmarks');
        const progressToInsert = (backupData.user_progress ?? []).map(p => {
            const mappedTopicId = topicIdMap.get(p.topic_id) || p.topic_id;
            return {
                id: crypto.randomUUID(),
                user_id: user.id,
                topic_id: mappedTopicId,
                completed: !!p.completed,
                notes: p.notes || '',
                updated_at: p.updated_at || new Date().toISOString()
            };
        });

        if (progressToInsert.length > 0) {
            const { error } = await supabase.from('user_progress').insert(progressToInsert);
            if (error) throw new Error(`Failed to restore progress: ${error.message}`);
        }

        // ── 6. Restore Weekly Goals & Reviews ────────────────────
        updateStep(5, 'Restoring weekly goals & reviews');
        const goalsToInsert = (backupData.weekly_goals ?? []).map(g => {
            const mappedTopicId = topicIdMap.get(g.topic_id) || g.topic_id;
            return {
                id: crypto.randomUUID(),
                user_id: user.id,
                topic_id: mappedTopicId,
                week_start: g.week_start,
                created_at: g.created_at || new Date().toISOString()
            };
        });

        if (goalsToInsert.length > 0) {
            const { error } = await supabase.from('weekly_goals').insert(goalsToInsert);
            if (error) throw new Error(`Failed to restore weekly goals: ${error.message}`);
        }

        const reviewsToInsert = (backupData.weekly_reviews ?? []).map(r => ({
            id: crypto.randomUUID(),
            user_id: user.id,
            week_start: r.week_start,
            completed_at: r.completed_at || new Date().toISOString()
        }));

        if (reviewsToInsert.length > 0) {
            const { error } = await supabase.from('weekly_reviews').insert(reviewsToInsert);
            if (error) throw new Error(`Failed to restore weekly reviews: ${error.message}`);
        }

        // ── 7. Restore Activity Logs ─────────────────────────────
        updateStep(6, 'Restoring activity logs & consistency');
        const activityToInsert = (backupData.activity_logs ?? []).map(a => ({
            id: crypto.randomUUID(),
            user_id: user.id,
            date: a.date,
            tasks_completed: a.tasks_completed || 0,
            created_at: a.created_at || new Date().toISOString(),
            updated_at: a.updated_at || new Date().toISOString()
        }));

        if (activityToInsert.length > 0) {
            const { error } = await supabase.from('activity_logs').insert(activityToInsert);
            if (error) throw new Error(`Failed to restore activity logs: ${error.message}`);
        }

        // ── 8. Restore Topic Media Metadata ──────────────────────
        if (backupData.topic_media && backupData.topic_media.length > 0) {
            const mediaToInsert = backupData.topic_media.map(m => {
                const mappedTopicId = topicIdMap.get(m.topic_id) || m.topic_id;
                const mappedSubjectId = subjectIdMap.get(m.subject_id) || m.subject_id;
                return {
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    topic_id: mappedTopicId,
                    subject_id: mappedSubjectId,
                    drive_file_id: m.drive_file_id,
                    file_name: m.file_name,
                    mime_type: m.mime_type,
                    created_at: m.created_at || new Date().toISOString()
                };
            });
            await supabase.from('topic_media').insert(mediaToInsert);
        }

        // ── 9. Refresh Cache & Synchronize ───────────────────────
        updateStep(7, 'Finalizing & refreshing cache');
        this.cacheService.clear();
        await this.activityService.syncActivity();

        return {
            success: true,
            subjectsRestored: subjectsToInsert.length,
            topicsRestored: topicsToInsert.length,
            subtopicsRestored: subtopicsToInsert.length,
            progressRestored: progressToInsert.length,
            message: `Successfully restored ${subjectsToInsert.length} subjects, ${topicsToInsert.length} topics, and ${subtopicsToInsert.length} subtopics.`
        };
    }
}
