-- Migration (part 1 of 2): move the Google refresh token out of `profiles`
--
-- Why: the refresh token lived in profiles.google_refresh_token. Row level
-- security lets a user read their own profile row, so the browser could read
-- the token (the old code even did, in hasStoredRefreshToken()). Anything that
-- runs script in the app's origin (an XSS bug, a malicious browser extension)
-- could have taken it and used it to reach the user's Google Drive files.
--
-- After this migration the token lives in public.user_google_tokens, which the
-- browser cannot read or write at all. The browser only talks to three small
-- functions that act on the signed-in user's own row and never return the token:
--   save_google_refresh_token(token)  store or replace my token
--   has_google_refresh_token()        true or false, is a token stored?
--   clear_google_refresh_token()      delete my token
-- Only the google-token Edge Function (service role) can read the token.
--
-- Run order:
--   1. Run THIS file in the Supabase SQL editor.
--   2. Deploy the Edge Function:  supabase functions deploy google-token
--   3. Deploy the app (push to main).
--   4. Run supabase_migration_google_token_cleanup.sql (part 2) to drop the old
--      column. Until then the old column still holds tokens the browser can read.
--
-- Safe to run more than once.

-- 1. Locked-down table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_google_tokens (
    user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies. With row level security on and no policy, the anon
-- and authenticated roles (the browser) are denied everything. The service role
-- used by the Edge Function bypasses row level security. The REVOKE is a second
-- lock in case a policy is ever added by mistake.
REVOKE ALL ON TABLE public.user_google_tokens FROM anon, authenticated;

-- 2. Copy any tokens already stored in profiles ------------------------------
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
    END IF;
END $$;

-- 3. Functions the browser may call (they only touch the caller's own row) ---
CREATE OR REPLACE FUNCTION public.save_google_refresh_token(p_refresh_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_refresh_token IS NULL OR p_refresh_token = '' THEN
        RAISE EXCEPTION 'Refresh token is required';
    END IF;

    INSERT INTO public.user_google_tokens (user_id, refresh_token, updated_at)
    VALUES (auth.uid(), p_refresh_token, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
                  updated_at    = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.has_google_refresh_token()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_google_tokens WHERE user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.clear_google_refresh_token()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.user_google_tokens WHERE user_id = auth.uid();
END;
$$;

-- Signed-in users only (functions are executable by everyone by default).
REVOKE ALL ON FUNCTION public.save_google_refresh_token(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_google_refresh_token()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_google_refresh_token()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_google_refresh_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_google_refresh_token()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_google_refresh_token()    TO authenticated;
