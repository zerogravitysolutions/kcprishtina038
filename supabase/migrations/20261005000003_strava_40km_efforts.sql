-- Derived best continuous 40 km per ride. Raw streams are never persisted.
create table public.strava_40km_efforts (
  athlete_id uuid not null references public.team_members(id) on delete cascade,
  strava_activity_id bigint not null,
  ride_started_at timestamptz not null,
  ride_date date not null,
  duration_seconds numeric not null check (duration_seconds > 0),
  elapsed_seconds numeric not null check (elapsed_seconds > 0),
  window_start_seconds numeric not null,
  window_end_seconds numeric not null,
  uses_moving_time boolean not null,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, strava_activity_id)
);
alter table public.strava_40km_efforts enable row level security;
create index strava_40km_efforts_best_idx on public.strava_40km_efforts(athlete_id, duration_seconds);
create index strava_40km_efforts_latest_idx on public.strava_40km_efforts(athlete_id, ride_started_at desc);

-- Bounded historical scan for all-time PBs and the latest qualifying ride.
create table public.strava_40km_backfills (
  athlete_id uuid primary key references public.team_members(id) on delete cascade,
  cursor_before bigint not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.strava_40km_backfills enable row level security;
