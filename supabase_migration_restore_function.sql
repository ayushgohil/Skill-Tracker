-- Migration: all-or-nothing backup restore
--
-- Why: restoring a backup used to run from the browser as a series of separate
-- calls: wipe the user's data first, then insert subjects, topics, subtopics and
-- so on one table at a time. If anything failed halfway (lost connection, a bad
-- value in the backup, a closed tab) the old data was already gone and only part
-- of the backup was in. Some of those calls also never checked for errors.
--
-- After this migration the whole restore is ONE database function. A function
-- runs in a single transaction, so either everything is replaced or nothing
-- changes at all.
--
--   restore_user_data(p_backup jsonb)  returns a JSON summary of what was restored
--
-- Things worth knowing:
--   * It runs as the signed-in user (SECURITY INVOKER), so your existing Row Level
--     Security policies apply exactly as they did when the browser did this work.
--     It only ever touches rows where user_id = auth.uid(); any user_id written
--     in the backup file is ignored.
--   * Every restored row gets a new id, and ids are re-linked (subject -> topic ->
--     subtopic, and so on), same as before.
--   * Progress that points at a topic that is not in the backup is kept when that
--     topic still exists and is visible to you (for example a topic from a subject
--     a study partner shared with you). If the topic no longer exists, that row is
--     skipped and counted in the summary, instead of failing the whole restore.
--   * Two restores for the same user cannot run at the same time.
--   * Needs supabase_migration_activity_daily.sql to have been run first
--     (it uses activity_logs.lifetime_total).
--
-- Run order: run this file BEFORE deploying the app version that calls it.
-- If the app is deployed first, restore shows an error and changes nothing.
--
-- Safe to run more than once.

-- activity_logs only had select / insert / update policies, so a user could never
-- delete their own rows. Under Row Level Security a delete without a policy does not
-- fail, it silently deletes nothing, so a restore could leave old heatmap days behind
-- and then trip over the one-row-per-day rule. This adds the missing delete policy.
DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_logs;
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_logs FOR DELETE
USING (auth.uid() = user_id);

-- Small helper: find the new id for an old id from a map, or keep the old id when
-- it is a valid uuid that is not in the map (it may be a shared topic).
CREATE OR REPLACE FUNCTION public.restore_resolve_id(p_map JSONB, p_old TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_old IS NULL THEN NULL
        WHEN p_map ? p_old THEN (p_map ->> p_old)::uuid
        WHEN p_old ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_old::uuid
        ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.restore_user_data(p_backup JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_key          TEXT;
    v_left         BOOLEAN;
    v_subjects     JSONB;
    v_topics       JSONB;
    v_subtopics    JSONB;
    v_progress     JSONB;
    v_goals        JSONB;
    v_reviews      JSONB;
    v_activity     JSONB;
    v_media        JSONB;
    v_subject_map  JSONB := '{}'::jsonb;
    v_topic_map    JSONB := '{}'::jsonb;
    v_n_subjects   INT := 0;
    v_n_topics     INT := 0;
    v_n_subtopics  INT := 0;
    v_n_progress   INT := 0;
    v_n_goals      INT := 0;
    v_n_reviews    INT := 0;
    v_n_activity   INT := 0;
    v_n_media      INT := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ── Validate the backup before touching anything ─────────────────────
    IF p_backup IS NULL OR jsonb_typeof(p_backup) <> 'object' THEN
        RAISE EXCEPTION 'Backup data is empty or invalid.';
    END IF;

    FOREACH v_key IN ARRAY ARRAY['subjects', 'topics', 'subtopics', 'user_progress',
                                 'weekly_goals', 'weekly_reviews', 'activity_logs', 'topic_media']
    LOOP
        IF p_backup ? v_key AND jsonb_typeof(p_backup -> v_key) NOT IN ('array', 'null') THEN
            RAISE EXCEPTION 'Backup field "%" must be a list.', v_key;
        END IF;
    END LOOP;

    IF jsonb_typeof(p_backup -> 'subjects') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_backup -> 'topics') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Backup file is missing required tables (subjects/topics).';
    END IF;

    v_subjects  := p_backup -> 'subjects';
    v_topics    := p_backup -> 'topics';
    v_subtopics := coalesce(nullif(p_backup -> 'subtopics', 'null'::jsonb), '[]'::jsonb);
    v_progress  := coalesce(nullif(p_backup -> 'user_progress', 'null'::jsonb), '[]'::jsonb);
    v_goals     := coalesce(nullif(p_backup -> 'weekly_goals', 'null'::jsonb), '[]'::jsonb);
    v_reviews   := coalesce(nullif(p_backup -> 'weekly_reviews', 'null'::jsonb), '[]'::jsonb);
    v_activity  := coalesce(nullif(p_backup -> 'activity_logs', 'null'::jsonb), '[]'::jsonb);
    v_media     := coalesce(nullif(p_backup -> 'topic_media', 'null'::jsonb), '[]'::jsonb);

    -- One restore per user at a time (released automatically at commit/rollback).
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

    -- ── 1. Wipe this user's data, children before parents ────────────────
    DELETE FROM public.activity_logs  WHERE user_id = v_uid;
    DELETE FROM public.weekly_reviews WHERE user_id = v_uid;
    DELETE FROM public.weekly_goals   WHERE user_id = v_uid;
    DELETE FROM public.topic_media    WHERE user_id = v_uid;
    DELETE FROM public.user_progress  WHERE user_id = v_uid;
    DELETE FROM public.subtopics      WHERE user_id = v_uid;
    DELETE FROM public.topics         WHERE user_id = v_uid;
    DELETE FROM public.subjects       WHERE user_id = v_uid;

    -- Row Level Security turns a delete you are not allowed to do into "0 rows deleted"
    -- instead of an error. Check that everything really went, so a missing delete policy
    -- stops the restore (and rolls it back) instead of leaving duplicates behind.
    FOREACH v_key IN ARRAY ARRAY['activity_logs', 'weekly_reviews', 'weekly_goals', 'topic_media',
                                 'user_progress', 'subtopics', 'topics', 'subjects']
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE user_id = $1)', v_key)
            INTO v_left USING v_uid;
        IF v_left THEN
            RAISE EXCEPTION 'Could not clear your existing % (a delete permission is missing). Nothing was changed.', v_key;
        END IF;
    END LOOP;

    -- ── 2. Subjects ──────────────────────────────────────────────────────
    WITH src AS (
        SELECT s.elem ->> 'id' AS old_id, gen_random_uuid() AS new_id, s.elem, s.ord
        FROM jsonb_array_elements(v_subjects) WITH ORDINALITY AS s(elem, ord)
    ), ins AS (
        INSERT INTO public.subjects (id, user_id, name, color, "order", created_at)
        SELECT new_id,
               v_uid,
               elem ->> 'name',
               coalesce(nullif(elem ->> 'color', ''), '#3b82f6'),
               coalesce(round((elem ->> 'order')::numeric)::int, (ord - 1)::int),
               coalesce((elem ->> 'created_at')::timestamptz, now())
        FROM src
        RETURNING id
    )
    SELECT coalesce(jsonb_object_agg(src.old_id, src.new_id) FILTER (WHERE src.old_id IS NOT NULL), '{}'::jsonb),
           (SELECT count(*) FROM ins)
    INTO v_subject_map, v_n_subjects
    FROM src;

    -- ── 3. Topics (subject must be restored above or still exist) ────────
    WITH src AS (
        SELECT t.elem ->> 'id' AS old_id,
               gen_random_uuid() AS new_id,
               public.restore_resolve_id(v_subject_map, t.elem ->> 'subject_id') AS subject_id,
               t.elem, t.ord
        FROM jsonb_array_elements(v_topics) WITH ORDINALITY AS t(elem, ord)
    ), ok AS (
        SELECT * FROM src
        WHERE EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = src.subject_id)
    ), ins AS (
        INSERT INTO public.topics (id, user_id, subject_id, title, depth, starred, "order", created_at)
        SELECT new_id,
               v_uid,
               subject_id,
               elem ->> 'title',
               coalesce(nullif(elem ->> 'depth', ''), 'shallow'),
               coalesce((elem ->> 'starred')::boolean, false),
               coalesce(round((elem ->> 'order')::numeric)::int, (ord - 1)::int),
               coalesce((elem ->> 'created_at')::timestamptz, now())
        FROM ok
        RETURNING id
    )
    SELECT coalesce(jsonb_object_agg(ok.old_id, ok.new_id) FILTER (WHERE ok.old_id IS NOT NULL), '{}'::jsonb),
           (SELECT count(*) FROM ins)
    INTO v_topic_map, v_n_topics
    FROM ok;

    -- ── 4. Subtopics ─────────────────────────────────────────────────────
    WITH src AS (
        SELECT public.restore_resolve_id(v_topic_map, s.elem ->> 'topic_id') AS topic_id, s.elem
        FROM jsonb_array_elements(v_subtopics) AS s(elem)
    ), ins AS (
        INSERT INTO public.subtopics (id, user_id, topic_id, title, completed, notes, "order", created_at)
        SELECT gen_random_uuid(),
               v_uid,
               topic_id,
               elem ->> 'title',
               coalesce((elem ->> 'completed')::boolean, false),
               coalesce(elem ->> 'notes', ''),
               coalesce(round((elem ->> 'order')::numeric)::int, 0),
               coalesce((elem ->> 'created_at')::timestamptz, now())
        FROM src
        WHERE EXISTS (SELECT 1 FROM public.topics t WHERE t.id = src.topic_id)
        RETURNING id
    )
    SELECT count(*) INTO v_n_subtopics FROM ins;

    -- ── 5. Progress and notes ────────────────────────────────────────────
    WITH src AS (
        SELECT public.restore_resolve_id(v_topic_map, p.elem ->> 'topic_id') AS topic_id, p.elem
        FROM jsonb_array_elements(v_progress) AS p(elem)
    ), ins AS (
        INSERT INTO public.user_progress (id, user_id, topic_id, completed, notes, updated_at)
        SELECT gen_random_uuid(),
               v_uid,
               topic_id,
               coalesce((elem ->> 'completed')::boolean, false),
               coalesce(elem ->> 'notes', ''),
               coalesce((elem ->> 'updated_at')::timestamptz, now())
        FROM src
        WHERE EXISTS (SELECT 1 FROM public.topics t WHERE t.id = src.topic_id)
        RETURNING id
    )
    SELECT count(*) INTO v_n_progress FROM ins;

    -- ── 6. Weekly goals and reviews ──────────────────────────────────────
    WITH src AS (
        SELECT public.restore_resolve_id(v_topic_map, g.elem ->> 'topic_id') AS topic_id, g.elem
        FROM jsonb_array_elements(v_goals) AS g(elem)
    ), ins AS (
        INSERT INTO public.weekly_goals (id, user_id, topic_id, week_start, created_at)
        SELECT gen_random_uuid(),
               v_uid,
               topic_id,
               (elem ->> 'week_start')::date,
               coalesce((elem ->> 'created_at')::timestamptz, now())
        FROM src
        WHERE EXISTS (SELECT 1 FROM public.topics t WHERE t.id = src.topic_id)
        RETURNING id
    )
    SELECT count(*) INTO v_n_goals FROM ins;

    WITH ins AS (
        INSERT INTO public.weekly_reviews (id, user_id, week_start, completed_at)
        SELECT gen_random_uuid(),
               v_uid,
               (r.elem ->> 'week_start')::date,
               coalesce((r.elem ->> 'completed_at')::timestamptz, now())
        FROM jsonb_array_elements(v_reviews) AS r(elem)
        RETURNING id
    )
    SELECT count(*) INTO v_n_reviews FROM ins;

    -- ── 7. Activity logs (heatmap) ───────────────────────────────────────
    WITH ins AS (
        INSERT INTO public.activity_logs (id, user_id, date, tasks_completed, lifetime_total, created_at, updated_at)
        SELECT gen_random_uuid(),
               v_uid,
               (a.elem ->> 'date')::date,
               coalesce((a.elem ->> 'tasks_completed')::int, 0),
               (a.elem ->> 'lifetime_total')::int,
               coalesce((a.elem ->> 'created_at')::timestamptz, now()),
               coalesce((a.elem ->> 'updated_at')::timestamptz, now())
        FROM jsonb_array_elements(v_activity) AS a(elem)
        RETURNING id
    )
    SELECT count(*) INTO v_n_activity FROM ins;

    -- ── 8. Attachment records (the files themselves stay in Google Drive) ─
    WITH src AS (
        SELECT public.restore_resolve_id(v_topic_map,   m.elem ->> 'topic_id')   AS topic_id,
               public.restore_resolve_id(v_subject_map, m.elem ->> 'subject_id') AS subject_id,
               m.elem
        FROM jsonb_array_elements(v_media) AS m(elem)
    ), ins AS (
        INSERT INTO public.topic_media (id, user_id, topic_id, subject_id, drive_file_id, file_name, mime_type, created_at)
        SELECT gen_random_uuid(),
               v_uid,
               topic_id,
               subject_id,
               elem ->> 'drive_file_id',
               elem ->> 'file_name',
               elem ->> 'mime_type',
               coalesce((elem ->> 'created_at')::timestamptz, now())
        FROM src
        WHERE EXISTS (SELECT 1 FROM public.topics   t WHERE t.id = src.topic_id)
          AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = src.subject_id)
        RETURNING id
    )
    SELECT count(*) INTO v_n_media FROM ins;

    -- ── Summary (skipped = rows whose parent no longer exists) ───────────
    RETURN jsonb_build_object(
        'subjects',       v_n_subjects,
        'topics',         v_n_topics,
        'subtopics',      v_n_subtopics,
        'user_progress',  v_n_progress,
        'weekly_goals',   v_n_goals,
        'weekly_reviews', v_n_reviews,
        'activity_logs',  v_n_activity,
        'topic_media',    v_n_media,
        'skipped',        jsonb_build_object(
            'subjects',      jsonb_array_length(v_subjects)  - v_n_subjects,
            'topics',        jsonb_array_length(v_topics)    - v_n_topics,
            'subtopics',     jsonb_array_length(v_subtopics) - v_n_subtopics,
            'user_progress', jsonb_array_length(v_progress)  - v_n_progress,
            'weekly_goals',  jsonb_array_length(v_goals)     - v_n_goals,
            'topic_media',   jsonb_array_length(v_media)     - v_n_media
        )
    );
END;
$$;

-- Signed-in users only (functions are executable by everyone by default).
REVOKE ALL ON FUNCTION public.restore_resolve_id(JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_user_data(JSONB)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_resolve_id(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_user_data(JSONB)        TO authenticated;
