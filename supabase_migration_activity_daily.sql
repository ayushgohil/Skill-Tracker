-- Migration: make activity_logs.tasks_completed a per-day count
--
-- Before this migration, tasks_completed held the LIFETIME number of completed
-- topics + subtopics at the time of the last sync that day, so the heatmap
-- showed a running total instead of daily work.
--
-- After it:
--   lifetime_total  = snapshot of all completed items on that day
--   tasks_completed = items completed that day (lifetime_total minus the
--                     previous logged day's lifetime_total, never below 0)
--
-- Safe to run more than once: only rows with lifetime_total IS NULL are converted.
-- Run this BEFORE deploying the matching app change.

ALTER TABLE public.activity_logs
    ADD COLUMN IF NOT EXISTS lifetime_total INT;

WITH calc AS (
    SELECT
        id,
        tasks_completed AS snapshot,
        GREATEST(
            tasks_completed - COALESCE(
                LAG(tasks_completed) OVER (PARTITION BY user_id ORDER BY date),
                0
            ),
            0
        ) AS daily
    FROM public.activity_logs
    WHERE lifetime_total IS NULL
)
UPDATE public.activity_logs a
SET lifetime_total  = calc.snapshot,
    tasks_completed = calc.daily
FROM calc
WHERE a.id = calc.id;

-- Note: a user's first logged day keeps its full snapshot as that day's count,
-- since earlier history can't be recovered.

-- To also remove the unused, unsafe increment_activity_log() function, run
-- supabase_migration_drop_increment_activity_log.sql.
