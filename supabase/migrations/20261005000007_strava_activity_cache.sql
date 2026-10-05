-- Each Strava activity is read once. The trimmed detail (metrics, route
-- polyline, segment efforts) is reused by grouping, segment sync, retries and
-- history scans. Service-only: RLS is on with no policies.
create table public.strava_activities (
  activity_id bigint primary key,
  athlete_id uuid not null references public.team_members(id) on delete cascade,
  started_at timestamptz,
  mode text check (mode in ('indoor', 'outdoor')), -- null: not a cycling activity
  detail jsonb,
  fetched_at timestamptz,
  forty_km_checked boolean not null default false
);
create index strava_activities_started_idx on public.strava_activities(started_at);
create index strava_activities_athlete_idx on public.strava_activities(athlete_id);
alter table public.strava_activities enable row level security;

-- The athlete profile (FTP) is read at most once a day per rider.
alter table public.strava_connections
  add column strava_ftp_w integer,
  add column strava_ftp_checked_at timestamptz;
