// src/app/core/services/backup.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { fetchAllRows } from '../supabase-paging';
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

        // Every table is read page by page: Supabase answers at most 1000 rows per request
        // and would otherwise leave the rest out of the backup without any warning.
        // Each query ends with a unique column so rows are never repeated or skipped.
        const all = <T>(table: string, ...order: { column: string; ascending?: boolean }[]) =>
            fetchAllRows<T>((from, to) => {
                let query = supabase.from(table).select('*', { count: 'exact' }).eq('user_id', user.id);
                for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true });
                return query.range(from, to);
            });

        const [
            profileRes,
            subjects,
            topics,
            subtopics,
            user_progress,
            weekly_goals,
            weekly_reviews,
            activity_logs,
            topic_media
        ] = await Promise.all([
            supabase.from('profiles').select('id, display_name, created_at').eq('id', user.id).maybeSingle(),
            all<Subject>('subjects', { column: 'created_at' }, { column: 'id' }),
            all<Topic>('topics', { column: 'created_at' }, { column: 'id' }),
            all<Subtopic>('subtopics', { column: 'order' }, { column: 'id' }),
            all<UserProgress>('user_progress', { column: 'topic_id' }),
            all<WeeklyGoal>('weekly_goals', { column: 'id' }),
            all<WeeklyReview>('weekly_reviews', { column: 'id' }),
            // These two tables may not exist on older databases (their migrations are optional),
            // so a failure here leaves them out instead of stopping the whole backup.
            all<ActivityLogItem>('activity_logs', { column: 'date' }).catch(err => {
                console.error('Could not read activity_logs for the backup:', err);
                return [] as ActivityLogItem[];
            }),
            all<TopicMediaItem>('topic_media', { column: 'id' }).catch(err => {
                console.error('Could not read topic_media for the backup:', err);
                return [] as TopicMediaItem[];
            })
        ]);

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
     * Backups made before the paging fix could be cut off at exactly 1000 rows per table
     * (a Supabase limit). A table with a round number of rows (1000, 2000, ...) is
     * therefore suspicious. Returns the names of those tables so the user can be warned
     * before a restore replaces everything. A real backup that happens to have exactly
     * 1000 rows also shows up here, so the wording must say "may".
     */
    findPossiblyCutOffTables(backup: BackupData): string[] {
        const tables: Record<string, unknown> = {
            subjects: backup.subjects,
            topics: backup.topics,
            subtopics: backup.subtopics,
            user_progress: backup.user_progress,
            weekly_goals: backup.weekly_goals,
            weekly_reviews: backup.weekly_reviews,
            activity_logs: backup.activity_logs,
            topic_media: backup.topic_media
        };
        return Object.entries(tables)
            .filter(([, rows]) => Array.isArray(rows) && rows.length > 0 && rows.length % 1000 === 0)
            .map(([name]) => name);
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
     * Fully restore and revert user data from BackupData.
     *
     * The work happens in ONE database function (restore_user_data), which runs as a
     * single transaction: it either replaces everything or changes nothing. If anything
     * goes wrong, your existing data is left exactly as it was.
     * (Needs supabase_migration_restore_function.sql to have been run.)
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

        // Backups made before the per-day heatmap change stored lifetime snapshots in
        // tasks_completed, so convert those to daily counts before sending them.
        const sortedLogs = [...(backupData.activity_logs ?? [])]
            .sort((a, b) => a.date.localeCompare(b.date));
        const isLegacyBackup = sortedLogs.length > 0 && sortedLogs.every(a => a.lifetime_total == null);
        let prevSnapshot = 0;

        const activityLogs = sortedLogs.map(a => {
            let lifetimeTotal: number | null = a.lifetime_total ?? null;
            let daily = a.tasks_completed || 0;
            if (isLegacyBackup) {
                lifetimeTotal = daily;
                daily = Math.max(0, lifetimeTotal - prevSnapshot);
                prevSnapshot = lifetimeTotal;
            }
            return {
                date: a.date,
                tasks_completed: daily,
                lifetime_total: lifetimeTotal,
                created_at: a.created_at,
                updated_at: a.updated_at
            };
        });

        const payload = {
            subjects: backupData.subjects ?? [],
            topics: backupData.topics ?? [],
            subtopics: backupData.subtopics ?? [],
            user_progress: backupData.user_progress ?? [],
            weekly_goals: backupData.weekly_goals ?? [],
            weekly_reviews: backupData.weekly_reviews ?? [],
            activity_logs: activityLogs,
            topic_media: backupData.topic_media ?? []
        };

        // ── One all-or-nothing database call ─────────────────────
        updateStep(0, 'Restoring your data');
        const { data, error } = await supabase.rpc('restore_user_data', { p_backup: payload });

        if (error) {
            if (error.code === 'PGRST202') {
                throw new Error('Restore needs a database update first (run supabase_migration_restore_function.sql). Your data was not changed.');
            }
            const reason = (error.message || 'Unknown error').replace(/\.+$/, '');
            throw new Error(`Restore failed: ${reason}. Your existing data was not changed.`);
        }

        // The database did all of the steps above in one go, so show the remaining
        // steps as finished.
        for (let step = 1; step <= 6; step++) {
            updateStep(step, 'Restored');
        }

        // ── Refresh Cache & Synchronize ──────────────────────────
        updateStep(7, 'Finalizing & refreshing cache');
        this.cacheService.clear();
        await this.activityService.syncActivity();

        const summary = (data ?? {}) as Record<string, any>;
        const skipped = Object.values((summary['skipped'] ?? {}) as Record<string, number>)
            .reduce((total, n) => total + (Number(n) || 0), 0);
        const subjectsRestored = Number(summary['subjects'] ?? 0);
        const topicsRestored = Number(summary['topics'] ?? 0);
        const subtopicsRestored = Number(summary['subtopics'] ?? 0);

        let message = `Successfully restored ${subjectsRestored} subjects, ${topicsRestored} topics, and ${subtopicsRestored} subtopics.`;
        if (skipped > 0) {
            message += ` ${skipped} item${skipped === 1 ? ' was' : 's were'} skipped because what they belonged to no longer exists.`;
        }

        return {
            success: true,
            subjectsRestored,
            topicsRestored,
            subtopicsRestored,
            progressRestored: Number(summary['user_progress'] ?? 0),
            itemsSkipped: skipped,
            message
        };
    }
}
