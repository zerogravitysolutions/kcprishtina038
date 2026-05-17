-- 0004 — Results + Media + News + Sponsors.

-- ============================================================
-- Race results (per event_category, per member).
-- ============================================================
create table public.results (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events(id) on delete cascade,
  category_id          uuid references public.event_categories(id) on delete set null,
  member_id            uuid references public.profiles(id) on delete set null,
  rider_name_override  text,  -- guest / non-member entries
  position             int,
  time_seconds         int,
  points               int,
  notes                text,
  recorded_by          uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  check (member_id is not null or rider_name_override is not null)
);
create index results_event_idx    on public.results(event_id);
create index results_member_idx   on public.results(member_id);
create index results_position_idx on public.results(event_id, position);

-- ============================================================
-- Media library (storage_path points into the Supabase Storage `media` bucket).
-- ============================================================
create table public.media (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null unique,
  filename      text not null,
  mime_type     text,
  width         int,
  height        int,
  byte_size     bigint,
  alt           text,
  caption       text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index media_uploader_idx on public.media(uploaded_by);

-- Now media exists → close the events.cover_media_id FK.
alter table public.events
  add constraint events_cover_media_fk
  foreign key (cover_media_id) references public.media(id) on delete set null;

-- ============================================================
-- News (blog posts with draft/publish workflow).
-- ============================================================
create table public.news (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title_sq        text not null,
  title_en        text,
  body_sq         text not null,
  body_en         text,
  cover_media_id  uuid references public.media(id) on delete set null,
  status          public.content_status not null default 'draft',
  author_id       uuid references public.profiles(id) on delete set null,
  published_at    timestamptz,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index news_status_idx    on public.news(status);
create index news_published_idx on public.news(published_at desc);
create trigger news_updated_at before update on public.news
  for each row execute function public.set_updated_at();

-- ============================================================
-- Sponsors (logo, tier, contract dates).
-- ============================================================
create table public.sponsors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  tier            public.sponsor_tier not null,
  logo_media_id   uuid references public.media(id) on delete set null,
  role_sq         text,
  role_en         text,
  body_sq         text,
  body_en         text,
  website_url     text,
  contract_start  date,
  contract_end    date,
  display_order   int not null default 100,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index sponsors_active_idx on public.sponsors(active, display_order);
create trigger sponsors_updated_at before update on public.sponsors
  for each row execute function public.set_updated_at();
