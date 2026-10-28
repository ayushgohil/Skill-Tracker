-- Migration: remove increment_activity_log()
--
-- Why: the function was SECURITY DEFINER (runs with the owner's rights, bypassing
-- row level security) and took the user id as a parameter. Any signed-in user
-- could call it through the API with someone else's id and change that user's
-- activity log. The app no longer calls it: activity.service.ts upserts the
-- signed-in user's own row, which row level security already protects.
--
-- Safe to run more than once, and safe to run at any time.

DROP FUNCTION IF EXISTS public.increment_activity_log(UUID, DATE);
