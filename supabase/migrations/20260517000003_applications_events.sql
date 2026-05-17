-- 0003 — Applications (the join form target) + Events + Categories + Registrations.

-- ============================================================
-- Applications (public can INSERT; staff reads + reviews).
-- ============================================================
create table public.applications (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null,
  phone         text,
  age           int check (age between 6 and 120),
  section_id    uuid references public.sections(id) on delete set null,
  experience    text check (experience in ('beginner','intermediate','advanced','racer')),
  notes         text,
  status        public.application_status not null default 'pending',
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index applications_status_idx     on public.applications(status);
create index applications_created_idx    on public.applications(created_at desc);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- ============================================================
-- Events (races, rides, camps, trainings).
-- cover_media_id FK added in migration 0004 once media exists.
-- ============================================================
create table public.events (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique,
  title_sq               text not null,
  title_en               text,
  type                   public.event_type not null,
  status                 public.event_status not null default 'draft',
  section_id             uuid references public.sections(id) on delete set null,
  start_at               timestamptz not null,
  end_at                 timestamptz,
  location               text,
  distance_km            numeric(6,1),
  elevation_m            int,
  description_sq         text,
  description_en         text,
  registration_open_at   timestamptz,
  registration_close_at  timestamptz,
  cover_media_id         uuid,   -- FK added in 0004
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index events_start_idx   on public.events(start_at);
create index events_status_idx  on public.events(status);
create index events_section_idx on public.events(section_id);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================
-- Event categories (Elite, U23, Masters, Femra, Youth — per event).
-- ============================================================
create table public.event_categories (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  name           text not null,
  max_riders     int,
  display_order  int not null default 0,
  unique (event_id, name)
);
create index event_categories_event_idx on public.event_categories(event_id);

-- ============================================================
-- Event registrations (member ↔ event).
-- ============================================================
create table public.event_registrations (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  member_id       uuid not null references public.profiles(id) on delete cascade,
  category_id     uuid references public.event_categories(id) on delete set null,
  status          public.registration_status not null default 'registered',
  bib_number      int,
  registered_at   timestamptz not null default now(),
  notes           text,
  unique (event_id, member_id)
);
create index registrations_event_idx  on public.event_registrations(event_id);
create index registrations_member_idx on public.event_registrations(member_id);
