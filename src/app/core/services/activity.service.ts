import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { AuthService } from './auth.service';
import { CacheService } from './cache.service';

export interface ActivityLog {
    id: string;
    user_id: string;
    date: string; // YYYY-MM-DD
    tasks_completed: number;
    created_at: string;
    updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {

    constructor(
        private auth: AuthService,
        private cacheService: CacheService
    ) {}

    /**
     * Returns today's date as a YYYY-MM-DD string using LOCAL time (not UTC).
     * Critical for users in non-UTC timezones (e.g. IST) where toISOString()
     * could return the previous day's date for hours before midnight UTC.
     */
    getLocalDateStr(date: Date = new Date()): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Gets activity logs for a specific year.
     */
    async getActivityLogsForYear(year: number): Promise<ActivityLog[]> {
        const userId = await this.auth.ensureUserId();

        const startDateStr = `${year}-01-01`;
        const endDateStr = `${year}-12-31`;

        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching activity logs (has the migration been run?):', error);
            return []; // Fail gracefully if table doesn't exist yet
        }
        return data as ActivityLog[];
    }

    /**
     * Fetches the last 400 days of activity logs using local dates.
     * Used for streak calculation so it correctly handles cross-year streaks
     * (e.g. a streak spanning Dec 31 → Jan 1).
     */
    async getRecentActivityLogs(forceRefresh = false): Promise<ActivityLog[]> {
        if (!forceRefresh) {
            const cached = this.cacheService.get('recent_activity_logs');
            if (cached) return cached;
        }

        const userId = await this.auth.ensureUserId();

        const endDate = this.getLocalDateStr();
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 400);
        const startDate = this.getLocalDateStr(startDateObj);

        const { data, error } = await supabase
            .from('activity_logs')
            .select('id, user_id, date, tasks_completed, created_at, updated_at')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching recent activity logs:', error);
            return [];
        }
        const result = data as ActivityLog[];
        this.cacheService.set('recent_activity_logs', result);
        return result;
    }

    /**
     * Syncs today's activity log.
     *
     * Each row stores two numbers:
     *  - lifetime_total:  how many topics + subtopics are completed right now (a snapshot)
     *  - tasks_completed: how many were completed TODAY = lifetime_total minus the
     *                     lifetime_total of the most recent earlier day (clamped at 0)
     *
     * The heatmap reads tasks_completed, so it shows work done per day instead of
     * the running total. Because both values are recomputed from the DB on every
     * call, this stays idempotent: toggling a checkbox 50× still gives the right count.
     * (Requires supabase_migration_activity_daily.sql to have been run.)
     */
    async syncActivity(): Promise<void> {
        const userId = await this.auth.ensureUserId();

        try {
            // Count topics completed (topics with no subtopics)
            const { count: topicCount } = await supabase
                .from('user_progress')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('completed', true);

            // Count subtopics completed (subtopics for topics that have subtopics)
            const { count: subtopicCount } = await supabase
                .from('subtopics')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('completed', true);

            const totalCompleted = (topicCount ?? 0) + (subtopicCount ?? 0);
            const today = this.getLocalDateStr();

            // Baseline = lifetime total recorded on the most recent earlier day.
            // No earlier snapshot (brand-new user) means everything counts as today's work.
            const { data: prior } = await supabase
                .from('activity_logs')
                .select('lifetime_total')
                .eq('user_id', userId)
                .lt('date', today)
                .not('lifetime_total', 'is', null)
                .order('date', { ascending: false })
                .limit(1)
                .maybeSingle();

            const baseline = prior?.lifetime_total ?? 0;
            const completedToday = Math.max(0, totalCompleted - baseline);

            const { error } = await supabase
                .from('activity_logs')
                .upsert({
                    user_id: userId,
                    date: today,
                    tasks_completed: completedToday,
                    lifetime_total: totalCompleted,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,date' });

            if (error) {
                console.error('Failed to upsert activity log (has supabase_migration_activity_daily.sql been run?):', error);
            }

            this.cacheService.clear('recent_activity_logs');
        } catch (e) {
            console.error('Failed to sync activity log:', e);
        }
    }
}
