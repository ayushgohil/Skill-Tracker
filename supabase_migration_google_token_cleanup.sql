-- Migration (part 2 of 2): drop profiles.google_refresh_token
--
-- Run this ONLY AFTER:
--   - supabase_migration_google_token_table.sql has been run,
--   - the google-token Edge Function has been redeployed
--       (supabase functions deploy google-token), and
--   - the new version of the app is live.
--
-- Until this runs, the old column still holds refresh tokens that the browser
-- can read, so the exposure is not fully closed.
--
-- Step 1 copies any token that was saved to the old column during the switch
-- (for example by a browser still running the old app). Step 2 drops the column.
-- Users who connected Drive in that window keep working; nobody has to reconnect.
--
-- Safe to run more than once.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'profiles'
          AND column_name  = 'google_refresh_token'
    ) THEN
        INSERT INTO public.user_google_tokens (user_id, refresh_token)
        SELECT id, google_refresh_token
        FROM public.profiles
        WHERE google_refresh_token IS NOT NULL AND google_refresh_token <> ''
        ON CONFLICT (user_id) DO NOTHING;

        ALTER TABLE public.profiles DROP COLUMN google_refresh_token;
    END IF;
END $$;
