-- Migration: Create activity_logs table for Heatmap & Streaks

-- 1. Create the activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    tasks_completed INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date) -- Ensure only one record per user per day
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Users can only read their own activity logs
CREATE POLICY "Users can view their own activity logs" 
ON public.activity_logs FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own activity logs
CREATE POLICY "Users can insert their own activity logs" 
ON public.activity_logs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own activity logs
CREATE POLICY "Users can update their own activity logs" 
ON public.activity_logs FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own activity logs (needed by backup restore; without a delete
-- policy Row Level Security makes deletes silently do nothing)
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_logs FOR DELETE
USING (auth.uid() = user_id);

-- Note: an earlier version of this file also created increment_activity_log().
-- It was removed because it ran as SECURITY DEFINER and trusted a caller-supplied
-- user id, and the app no longer uses it (see activity.service.ts, which upserts
-- the signed-in user's own row). Existing databases should run
-- supabase_migration_drop_increment_activity_log.sql.
