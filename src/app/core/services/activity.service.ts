// src/app/core/services/activity.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const startDateStr = `${year}-01-01`;
        const endDateStr = `${year}-12-31`;

        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', user.id)
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
    async getRecentActivityLogs(): Promise<ActivityLog[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const endDate = this.getLocalDateStr();
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 400);
        const startDate = this.getLocalDateStr(startDateObj);

        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching recent activity logs:', error);
            return [];
        }
        return data as ActivityLog[];
    }

    /**
     * Logs an activity. If a record for today exists, it increments tasks_completed.
     */
    async logActivity(): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Note: Ideally this calls the increment_activity_log RPC function from the migration.
        // As a fallback if the RPC wasn't created, we try a standard upsert.
        try {
            const { error: rpcError } = await supabase.rpc('increment_activity_log', {
                p_user_id: user.id,
                p_date: this.getLocalDateStr()  // ✅ Use local date, not UTC
            });
            
            if (rpcError) {
                console.warn('RPC failed, falling back to manual upsert:', rpcError);
                // Fallback (might not increment correctly if concurrent, but fine for now)
                const date = this.getLocalDateStr();  // ✅ Use local date, not UTC
                const { data } = await supabase
                    .from('activity_logs')
                    .select('tasks_completed')
                    .eq('user_id', user.id)
                    .eq('date', date)
                    .single();
                
                const currentCount = data?.tasks_completed ?? 0;
                await supabase
                    .from('activity_logs')
                    .upsert({
                        user_id: user.id,
                        date: date,
                        tasks_completed: currentCount + 1,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,date' });
            }
        } catch (e) {
             console.error('Failed to log activity. Migration might not be run yet.', e);
        }
    }
}
