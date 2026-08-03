-- 0018 — Coaching: training rides, per-athlete entries, performance profiles.
--
-- Athletes are rows in public.team_members (the roster; position 'rider').
-- A "training ride" is one session; it holds 1..N ride_entries — one per
-- athlete. A solo ride is simply a ride with a single entry. Per-athlete
-- metrics live on ride_entries so a single group session can carry different
-- numbers for each rider ("group ride, custom values per member").
--
-- athlete_profiles caches coach-maintained baselines (current FTP, weight,
-- HRmax, resting HR, notes). All-time power bests are derived live from
-- ride_entries in the app, so there is nothing to keep in sync here.
--
-- Access: any staff coach (admin / editor / staff / coach) manages everything.
-- No section scoping — the club runs 1–2 coaches over the whole roster.
-- Nobody else (members / anon) can read this private performance data.

-- ============================================================
-- Enums
-- ============================================================
create type public.training_ride_kind as enum ('group', 'solo');

-- ============================================================
-- training_rides — one session (group or solo).
-- ============================================================
create table public.training_rides (
  id            uuid primary key default gen_random_uuid(),
  kind          public.training_ride_kind not null default 'group',
  ride_date     date not null,
  title         text,
  focus         text,                    -- free text: "4x8 threshold", "endurance Z2"
  section_id    uuid references public.sections(id) on delete set null,
  location      text,
  route_url     text,                    -- optional shared Strava route/segment
  notes         text,                    -- session-level coach notes
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index training_rides_date_idx    on public.training_rides(ride_date desc);
create index training_rides_section_idx on public.training_rides(section_id);
create trigger training_rides_updated_at before update on public.training_rides
  for each row execute function public.set_updated_at();

-- ============================================================
-- ride_entries — one athlete's performance within a ride.
-- ============================================================
create table public.ride_entries (
  id                 uuid primary key default gen_random_uuid(),
  ride_id            uuid not null references public.training_rides(id) on delete cascade,
  athlete_id         uuid not null references public.team_members(id) on delete cascade,
  participated       boolean not null default true,

  -- Core
  distance_km        numeric(6,2) check (distance_km is null or distance_km >= 0),
  moving_seconds     integer      check (moving_seconds is null or moving_seconds >= 0),
  elapsed_seconds    integer      check (elapsed_seconds is null or elapsed_seconds >= 0),
  elevation_m        integer      check (elevation_m is null or elevation_m >= 0),

  -- Heart rate
  avg_hr             integer check (avg_hr is null or (avg_hr between 20 and 260)),
  max_hr             integer check (max_hr is null or (max_hr between 20 and 260)),

  -- Power
  avg_power_w        integer check (avg_power_w is null or avg_power_w >= 0),
  np_w               integer check (np_w is null or np_w >= 0),   -- normalized power
  ftp_w              integer check (ftp_w is null or ftp_w >= 0),
  set_ftp            boolean not null default false,               -- push ftp_w to profile on save

  -- Best (peak) power for standard durations
  best_power_1m_w    integer check (best_power_1m_w  is null or best_power_1m_w  >= 0),
  best_power_3m_w    integer check (best_power_3m_w  is null or best_power_3m_w  >= 0),
  best_power_5m_w    integer check (best_power_5m_w  is null or best_power_5m_w  >= 0),
  best_power_10m_w   integer check (best_power_10m_w is null or best_power_10m_w >= 0),
  best_power_20m_w   integer check (best_power_20m_w is null or best_power_20m_w >= 0),
  best_power_60m_w   integer check (best_power_60m_w is null or best_power_60m_w >= 0),

  -- Effort
  tss                numeric(6,1) check (tss is null or tss >= 0),
  intensity_factor   numeric(4,2) check (intensity_factor is null or intensity_factor >= 0),
  rpe                smallint     check (rpe is null or (rpe between 1 and 10)),
  avg_cadence        integer      check (avg_cadence is null or avg_cadence >= 0),

  -- Strava + notes
  strava_url         text,
  strava_activity_id bigint,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (ride_id, athlete_id)
);
create index ride_entries_ride_idx    on public.ride_entries(ride_id);
create index ride_entries_athlete_idx on public.ride_entries(athlete_id);
create trigger ride_entries_updated_at before update on public.ride_entries
  for each row execute function public.set_updated_at();

-- ============================================================
-- athlete_profiles — coach-maintained baselines, 1:1 with team_members.
-- All-time power bests are derived from ride_entries at read time.
-- ============================================================
create table public.athlete_profiles (
  athlete_id     uuid primary key references public.team_members(id) on delete cascade,
  ftp_w          integer check (ftp_w is null or ftp_w >= 0),
  ftp_updated_at date,
  weight_kg      numeric(5,2) check (weight_kg is null or weight_kg >= 0),
  max_hr         integer check (max_hr is null or (max_hr between 20 and 260)),
  resting_hr     integer check (resting_hr is null or (resting_hr between 20 and 200)),
  notes          text,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger athlete_profiles_updated_at before update on public.athlete_profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS — staff (incl. coach) full access; everyone else denied.
-- ============================================================
alter table public.training_rides   enable row level security;
alter table public.ride_entries     enable row level security;
alter table public.athlete_profiles enable row level security;

create policy training_rides_staff_all on public.training_rides
  for all to authenticated
  using      (public.has_role(array['admin','editor','staff','coach']::public.user_role[]))
  with check (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy ride_entries_staff_all on public.ride_entries
  for all to authenticated
  using      (public.has_role(array['admin','editor','staff','coach']::public.user_role[]))
  with check (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy athlete_profiles_staff_all on public.athlete_profiles
  for all to authenticated
  using      (public.has_role(array['admin','editor','staff','coach']::public.user_role[]))
  with check (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

-- Sanity (run by hand after apply):
--   select count(*) from public.training_rides;
--   select count(*) from public.ride_entries;
