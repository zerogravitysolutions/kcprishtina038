-- 0020 — Race articles: synthesize full description + cover for each
-- race_events row from its linked FB news posts.
--
-- Previously each race_events row had a 1-sentence description and no
-- cover. /races cards rendered placeholder boxes ("GARË"/"MTB"/"TOUR")
-- and /races/[slug] showed minimal article content.
--
-- This migration:
-- 1. Sets cover_media_id to the cover of the longest linked news post
--    that has a cover (typically the post-race summary).
-- 2. Replaces the short description with the full body of the longest
--    linked news post, which in practice is the most complete write-up
--    (race summary with results, or the most detailed announcement).
--
-- One-time job — the catalog is curated, not auto-generated. Future
-- edits via SQL or a future admin UI.

-- Step 1: pick the "primary" linked news post per race (longest body,
-- preferring posts with a cover). Materialize into a temp.
create temporary table _race_primary on commit drop as
select distinct on (n.race_event_id)
  n.race_event_id,
  n.cover_media_id,
  n.body_sq
from public.news n
where n.race_event_id is not null
order by
  n.race_event_id,
  (n.cover_media_id is not null) desc,
  length(coalesce(n.body_sq, '')) desc;

-- Step 2: apply.
update public.race_events re
set
  cover_media_id = coalesce(p.cover_media_id, re.cover_media_id),
  description    = case
    when coalesce(length(p.body_sq), 0) > 0 then p.body_sq
    else re.description
  end
from _race_primary p
where re.id = p.race_event_id;

-- Sanity:
--   select slug, name, cover_media_id is not null as has_cover,
--          length(description) as desc_len
--   from public.race_events order by race_date desc;
