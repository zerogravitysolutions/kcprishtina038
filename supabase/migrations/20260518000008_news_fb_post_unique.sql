-- Fix the FB → news pipeline that silently broke after the original backfill.
--
-- The Edge Function's upsertNewsFromPost uses
--   .upsert(payload, { onConflict: "fb_post_id", ignoreDuplicates: true })
-- which translates to
--   INSERT ... ON CONFLICT (fb_post_id) DO NOTHING
-- But the unique index defined in migration 0013 was PARTIAL:
--   CREATE UNIQUE INDEX news_fb_post_idx ON news(fb_post_id)
--     WHERE source = 'facebook';
-- Postgres can't match ON CONFLICT(fb_post_id) against a partial index
-- whose WHERE clause isn't repeated in the conflict target, so every
-- insert raised 42P10 ("no unique or exclusion constraint matching the
-- ON CONFLICT specification") and the function logged it as a warn and
-- moved on — leaving the news table frozen at the backfill cutoff.
--
-- Replace the partial unique with a plain unique. The partial WHERE
-- existed to allow multiple manual news rows with NULL fb_post_id, but
-- a regular UNIQUE in Postgres already permits multiple NULLs (NULLs
-- are treated as distinct), so the partial wasn't necessary.

drop index if exists public.news_fb_post_idx;

-- Plain UNIQUE: multiple NULLs are permitted (Postgres treats NULLs as
-- distinct in unique indexes by default), so manual news rows with no
-- fb_post_id still coexist freely.
create unique index news_fb_post_idx
  on public.news(fb_post_id);
