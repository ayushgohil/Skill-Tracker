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

-- 4. Create an upsert helper function (optional but useful for incrementing tasks)
-- This allows us to increment the tasks_completed count for a specific date
CREATE OR REPLACE FUNCTION increment_activity_log(p_user_id UUID, p_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO public.activity_logs (user_id, date, tasks_completed)
    VALUES (p_user_id, p_date, 1)
    ON CONFLICT (user_id, date)
    DO UPDATE SET 
        tasks_completed = public.activity_logs.tasks_completed + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
