-- 0013 — News rows can be sourced from Facebook posts OR created manually.
--
-- Before this migration:
--   - public.news held only editorial content authored by admins.
--   - Facebook posts lived in public.fb_posts and were rendered directly
--     on the public site by linking each card out to facebook.com.
--
-- After this migration:
--   - public.news is the single source of truth for everything displayed
--     on /news (and the homepage news strip). Each row knows whether it
--     came from FB sync or a manual /admin/news entry.
--   - The sync-facebook Edge Function (next deploy) will INSERT a news
--     row for every new fb_post — auto-published — but will NOT update
--     news rows on re-sync. Once a row is in news, the editor owns it.
--
-- A backfill INSERT at the bottom seeds news rows for all 68 fb_posts
-- already in the DB so the public site has content the moment this
-- migration applies.

-- ============================================================
-- Source enum + schema additions.
-- ============================================================
create type public.news_source as enum ('manual', 'facebook');

alter table public.news
  add column source             public.news_source not null default 'manual',
  add column fb_post_id         text references public.fb_posts(id) on delete set null,
  add column gallery_media_ids  uuid[] not null default '{}'::uuid[],
  add column external_url       text;

create unique index news_fb_post_idx
  on public.news(fb_post_id)
  where fb_post_id is not null;

create index news_source_published_idx
  on public.news(source, published_at desc nulls last);

-- ============================================================
-- Backfill — one row in `news` for every row currently in `fb_posts`,
-- with status='published' and published_at = fb_post.created_time.
--
-- Slug pattern: `fb-<post_id_unique_part>` (the part after the `_`
-- in '{page_id}_{post_id}'). Predictable, idempotent, URL-safe.
-- Title is the first 120 chars of message (or story, falling back).
-- Gallery is the ordered set of media_ids attached to the post.
-- ============================================================
insert into public.news
  (slug, title_sq, body_sq, cover_media_id, status, published_at,
   tags, source, fb_post_id, external_url, gallery_media_ids)
select
  'fb-' || split_part(p.id, '_', 2) as slug,
  coalesce(
    nullif(left(p.message, 120), ''),
    nullif(left(p.story, 120), ''),
    'KÇ Prishtina 038'
  ) as title_sq,
  coalesce(p.message, p.story, '') as body_sq,
  p.cover_media_id,
  'published'::public.content_status,
  p.created_time,
  array['facebook']::text[],
  'facebook'::public.news_source,
  p.id,
  p.permalink_url,
  coalesce(
    (select array_agg(fp.media_id order by fp.created_time nulls last)
     from public.fb_photos fp where fp.post_id = p.id),
    '{}'::uuid[]
  )
from public.fb_posts p
where not exists (
  select 1 from public.news n where n.fb_post_id = p.id
)
on conflict (slug) do nothing;

-- ============================================================
-- Sanity comment: how to verify after apply.
--
--   select source, status, count(*) from public.news group by 1,2;
--   -- expect ~68 rows with source='facebook', status='published'
--
--   select slug, title_sq from public.news where source='facebook'
--   order by published_at desc limit 3;
-- ============================================================
