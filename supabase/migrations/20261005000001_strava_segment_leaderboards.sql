-- Coach-only Strava segment performance. OAuth tokens remain in the separate
-- service-role table; no raw GPS streams or public leaderboard data are saved.
create table public.strava_segment_efforts (
  athlete_id uuid not null references public.team_members(id) on delete cascade,
  strava_activity_id bigint not null,
  segment_id bigint not null,
  started_at timestamptz not null,
  local_date date not null,
  elapsed_seconds integer not null check (elapsed_seconds > 0),
  moving_seconds integer,
  distance_m numeric,
  avg_power_w numeric,
  avg_hr numeric,
  max_hr numeric,
  avg_cadence numeric,
  device_watts boolean,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, strava_activity_id, segment_id, started_at)
);
alter table public.strava_segment_efforts enable row level security;
create index strava_segment_efforts_rider_segment_best_idx
  on public.strava_segment_efforts(athlete_id, segment_id, elapsed_seconds, started_at);
create index strava_segment_efforts_rider_segment_latest_idx
  on public.strava_segment_efforts(athlete_id, segment_id, started_at desc);
create index strava_segment_efforts_activity_idx
  on public.strava_segment_efforts(athlete_id, strava_activity_id);

-- Strava's athlete-specific segment summary supplies an all-time PR even if a
-- rider has not granted access to the subscription-only effort history API.
create table public.strava_segment_stats (
  athlete_id uuid not null references public.team_members(id) on delete cascade,
  segment_id bigint not null,
  pr_activity_id bigint,
  pr_elapsed_seconds integer check (pr_elapsed_seconds > 0),
  pr_date date,
  effort_count integer,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, segment_id)
);
alter table public.strava_segment_stats enable row level security;

-- For riders without subscriber access to the segment-efforts endpoint, scan
-- activity details in bounded batches until their older attempts are covered.
create table public.strava_segment_backfills (
  athlete_id uuid primary key references public.team_members(id) on delete cascade,
  cursor_before bigint not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.strava_segment_backfills enable row level security;
