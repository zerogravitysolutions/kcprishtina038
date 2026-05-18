-- race_events.gallery_media_ids
--
-- Mirrors news.gallery_media_ids so when an admin creates a race from a
-- news post, the post's gallery (cover + extra photos pulled by the FB
-- sync) can be carried over to the race entry as its own gallery.
-- Public /races/[slug] renders these alongside the cover.

alter table public.race_events
  add column if not exists gallery_media_ids uuid[] not null default '{}'::uuid[];
