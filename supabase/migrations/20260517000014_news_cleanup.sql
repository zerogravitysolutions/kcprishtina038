-- 0014 — Clean up news rows imported in 0013 that shouldn't be there,
-- and regenerate the title_sq column to a clean short headline.
--
-- The 0013 backfill imported every fb_post into news. Two classes were
-- mistakes:
--   1. Reshared posts (status_type='shared_story' or
--      attachments[0].type='share') — original content belongs to the
--      page that authored it, not to us.
--   2. Empty "status update" posts (no message and no cover image) —
--      these are pure Facebook system events with no content to display.
--
-- Also, the 0013 backfill set title_sq = left(message, 120), which cuts
-- mid-word and includes literal newlines. This migration regenerates
-- title_sq via a clean first-line, word-boundary truncation.
--
-- The Edge Function (next deploy) filters both classes at sync time so
-- they don't reappear.

-- ============================================================
-- Step 1: delete news rows for reshared posts.
-- ============================================================
delete from public.news
where source = 'facebook'
  and fb_post_id in (
    select p.id
    from public.fb_posts p
    where p.status_type = 'shared_story'
       or (p.attachments::jsonb->'data'->0->>'type') = 'share'
  );

-- ============================================================
-- Step 2: delete news rows for empty status updates.
-- (No message text and no cover image attached.)
-- ============================================================
delete from public.news
where source = 'facebook'
  and cover_media_id is null
  and (gallery_media_ids is null or array_length(gallery_media_ids, 1) is null)
  and fb_post_id in (
    select p.id
    from public.fb_posts p
    where p.message is null or trim(p.message) = ''
  );

-- ============================================================
-- Step 3: drop the underlying fb_posts for reshares so they don't waste
-- storage and don't get re-promoted to news on next sync.
-- (fb_photos with post_id FK cascade-clear by ON DELETE SET NULL.)
-- ============================================================
delete from public.fb_posts
where status_type = 'shared_story'
   or (attachments::jsonb->'data'->0->>'type') = 'share';

-- ============================================================
-- Step 4: regenerate title_sq for the surviving FB-sourced news rows.
-- Uses a SQL implementation of the JS helper buildNewsTitle:
--   * trim
--   * take first line (everything before the first \n)
--   * if first line < 12 chars: collapse all whitespace from the body
--     (otherwise short lines like "The Team 🚴‍♀️ 🚴‍♂️" lose context)
--   * truncate at <=80 chars on a word boundary, append "…" if cut
-- ============================================================
create or replace function pg_temp.fb_news_title(msg text)
returns text language plpgsql as $$
declare
  cleaned text;
  first_line text;
  src text;
  cut text;
  last_space int;
  cap constant int := 80;
begin
  cleaned := regexp_replace(coalesce(msg, ''), E'\\r\\n', E'\\n', 'g');
  cleaned := btrim(cleaned);
  if cleaned = '' then return null; end if;
  first_line := split_part(cleaned, E'\n', 1);
  first_line := btrim(first_line);
  if length(first_line) >= 12 then
    src := first_line;
  else
    src := regexp_replace(cleaned, E'\\s+', ' ', 'g');
  end if;
  if length(src) <= cap then return src; end if;
  cut := left(src, cap - 1);
  last_space := length(cut) - position(' ' in reverse(cut));
  if last_space > cap * 0.6 then
    return regexp_replace(left(cut, last_space), E'[\\s.,;:!?\\-—]+$', '', 'g') || '…';
  else
    return regexp_replace(left(cut, cap - 1), E'[\\s.,;:!?\\-—]+$', '', 'g') || '…';
  end if;
end;
$$;

update public.news n
set title_sq = coalesce(
  pg_temp.fb_news_title(p.message),
  'Postim ' || to_char(p.created_time, 'YYYY-MM-DD')
)
from public.fb_posts p
where n.fb_post_id = p.id
  and n.source = 'facebook';

-- ============================================================
-- Sanity: verify
--   select count(*) from public.news;
--   select count(*) from public.fb_posts;
--   select title_sq from public.news where source='facebook' order by published_at desc limit 5;
-- ============================================================
