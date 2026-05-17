-- 0018 — Curated hero photos.
--
-- The landing-page hero collage was reading the 3 most-recent FB photos
-- regardless of visual quality (the recent ones tend to be portraits or
-- low-res phone shots). This adds a `featured_in_hero` flag on `media`
-- so editors can manually curate which photos appear in the hero,
-- independent of how they got into the bucket (FB sync or manual upload).
--
-- Curation today is via SQL (and the seed at the bottom of this file).
-- A small /admin/media toggle can be added later if needed.

alter table public.media
  add column featured_in_hero boolean not null default false,
  add column featured_order int not null default 100;

create index media_hero_idx
  on public.media(featured_in_hero, featured_order)
  where featured_in_hero = true;

-- ============================================================
-- Seed — mark a few large landscape race photos as featured.
-- Pulled from spelunking fb_photos: race posts from 2024 and 2025
-- with the largest byte_size landscape orientation. Editor can refine
-- via SQL or future admin UI.
-- ============================================================
update public.media
set featured_in_hero = true, featured_order = pick.ord
from (values
  ('390420774008336', 10),  -- 2024-06-24, largest landscape (1080×720)
  ('677751531941924', 20),  -- 2025-08-06 Sharr Cup 2025
  ('389492064101207', 30),  -- 2024-06-23 Kampionati i Kosovës
  ('677751518608592', 40),  -- 2025-08-06 Sharr Cup, second shot
  ('677751535275257', 50),  -- 2025-08-06 Sharr Cup, third
  ('361296976920716', 60)   -- 2024-05-08 Shtime ride
) as pick(external_id, ord)
where public.media.source = 'facebook'
  and public.media.external_id = pick.external_id;

-- Sanity: select count(*) from public.media where featured_in_hero = true;
