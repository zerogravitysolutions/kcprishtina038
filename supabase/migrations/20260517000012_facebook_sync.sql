-- 0012 — Facebook Page sync (posts, photos, albums, events, page profile).
--
-- The KÇ Prishtina 038 Facebook Page is treated as the canonical source of
-- public content. An Edge Function (sync-facebook) calls Graph API on an
-- hourly schedule and upserts data here. Images are downloaded to the
-- existing `media` Storage bucket under prefix `fb/` so we don't depend on
-- Facebook's CDN URL lifetime.
--
-- FB events sync into the existing public.events table with source='facebook'
-- (auto-publish) so the existing events.html / countdown queries pick them up
-- with no frontend changes.

-- ============================================================
-- Enum for sync-state row kinds.
-- ============================================================
create type public.fb_source_kind as enum ('post','photo','album','event','page');

-- ============================================================
-- Extend public.media: support facebook-sourced rows + dedup index.
-- ============================================================
alter table public.media
  add column source       text not null default 'upload'
    check (source in ('upload','facebook')),
  add column external_id  text,
  add column external_url text;

create unique index media_external_idx
  on public.media(source, external_id)
  where external_id is not null;

-- ============================================================
-- Extend public.events: support facebook-sourced rows; editor-modified
-- events stay sticky if their source flips to 'native'.
-- ============================================================
alter table public.events
  add column source       text not null default 'native'
    check (source in ('native','facebook')),
  add column external_id  text unique,
  add column external_url text;

create index events_source_idx on public.events(source);

-- ============================================================
-- One row per synced FB page (future-proof for multiple pages).
-- id is the FB numeric id (text to avoid bigint precision concerns).
-- ============================================================
create table public.fb_pages (
  id                text primary key,
  username          text,
  name              text,
  about             text,
  bio               text,
  category          text,
  website           text,
  fan_count         int,
  picture_media_id  uuid references public.media(id) on delete set null,
  cover_media_id    uuid references public.media(id) on delete set null,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger fb_pages_updated_at before update on public.fb_pages
  for each row execute function public.set_updated_at();

-- ============================================================
-- Posts. id is the FB post id ('{pageid}_{postid}').
-- `hidden` lets an editor soft-suppress a post without it resurrecting
-- on the next sync; service-role writes UPSERT but never reset `hidden`.
-- `raw` keeps the full FB payload so we can recover columns without
-- a re-sync if we extend the schema.
-- ============================================================
create table public.fb_posts (
  id              text primary key,
  page_id         text not null references public.fb_pages(id) on delete cascade,
  message         text,
  permalink_url   text,
  story           text,
  status_type     text,
  created_time    timestamptz not null,
  cover_media_id  uuid references public.media(id) on delete set null,
  attachments     jsonb not null default '[]'::jsonb,
  is_published    boolean not null default true,
  hidden          boolean not null default false,
  raw             jsonb,
  fetched_at      timestamptz not null default now()
);
create index fb_posts_page_time_idx
  on public.fb_posts(page_id, created_time desc);
create index fb_posts_visible_idx
  on public.fb_posts(created_time desc)
  where hidden = false;

-- ============================================================
-- Albums.
-- ============================================================
create table public.fb_albums (
  id              text primary key,
  page_id         text not null references public.fb_pages(id) on delete cascade,
  name            text,
  description     text,
  cover_media_id  uuid references public.media(id) on delete set null,
  count           int,
  created_time    timestamptz,
  updated_time    timestamptz,
  fetched_at      timestamptz not null default now()
);

-- ============================================================
-- Photos. Either standalone (album_id set, post_id null) or attached
-- to a post (post_id set). The media_id FK is required — every photo
-- row must point at a downloaded image in public.media.
-- ============================================================
create table public.fb_photos (
  id              text primary key,
  page_id         text not null references public.fb_pages(id) on delete cascade,
  album_id        text references public.fb_albums(id) on delete set null,
  post_id         text references public.fb_posts(id)  on delete set null,
  media_id        uuid not null references public.media(id) on delete cascade,
  alt_text        text,
  width           int,
  height          int,
  created_time    timestamptz,
  fetched_at      timestamptz not null default now()
);
create index fb_photos_album_idx on public.fb_photos(album_id);
create index fb_photos_post_idx  on public.fb_photos(post_id);
create index fb_photos_time_idx  on public.fb_photos(created_time desc);

-- ============================================================
-- Sync state: one row per sync run, per kind, for observability.
-- ============================================================
create table public.fb_sync_state (
  id              uuid primary key default gen_random_uuid(),
  page_id         text references public.fb_pages(id) on delete cascade,
  kind            public.fb_source_kind not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  ok              boolean,
  items_seen      int default 0,
  items_upserted  int default 0,
  items_failed    int default 0,
  error           text,
  cursor_next     text
);
create index fb_sync_state_kind_idx
  on public.fb_sync_state(kind, started_at desc);

-- ============================================================
-- RLS — public read for visible content; service-role writes bypass RLS.
-- Editors can soft-hide posts.
-- ============================================================
alter table public.fb_pages      enable row level security;
alter table public.fb_posts      enable row level security;
alter table public.fb_albums     enable row level security;
alter table public.fb_photos     enable row level security;
alter table public.fb_sync_state enable row level security;

create policy fb_pages_select_all   on public.fb_pages   for select using (true);
create policy fb_albums_select_all  on public.fb_albums  for select using (true);
create policy fb_photos_select_all  on public.fb_photos  for select using (true);

create policy fb_posts_select_pub on public.fb_posts
  for select using (hidden = false and is_published = true);

create policy fb_posts_select_editor on public.fb_posts
  for select to authenticated
  using (public.has_role(array['admin','editor']::public.user_role[]));

create policy fb_posts_hide_editor on public.fb_posts
  for update to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

create policy fb_sync_admin on public.fb_sync_state
  for select to authenticated
  using (public.has_role(array['admin']::public.user_role[]));

-- ============================================================
-- Scheduler: pg_cron + pg_net. URL + shared secret live in public.settings
-- (admin-only RLS already enforced by 0006). The cron statement reads them
-- with the cron-owner's session, which bypasses RLS.
--
-- After deploy, the admin must:
--   1. supabase secrets set FB_PAGE_ACCESS_TOKEN=... SYNC_SHARED_SECRET=... FB_PAGE_ID=...
--   2. UPDATE public.settings SET value = to_jsonb('<secret>'::text) WHERE key='fb_sync_secret';
-- The cron job fires hourly; until step 2 runs the request will 401 and
-- the row in fb_sync_state will record the error.
-- ============================================================
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

insert into public.settings(key, value) values
  ('fb_sync_url',
   to_jsonb('https://xutklvcsdgzmhxzexisb.functions.supabase.co/sync-facebook'::text)),
  ('fb_sync_secret', to_jsonb(''::text))
on conflict (key) do nothing;

select cron.schedule(
  'fb-sync-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url     := (select (value #>> '{}') from public.settings where key='fb_sync_url'),
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-sync-secret', (select (value #>> '{}') from public.settings where key='fb_sync_secret')
    ),
    body    := jsonb_build_object('kind','all')
  );
  $$
);
