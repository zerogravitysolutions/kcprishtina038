-- Strava OAuth credentials are accessed only through the service-role client.
-- No authenticated/anon RLS policies are granted for this table.
create table public.strava_connections (
  athlete_id uuid primary key references public.team_members(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  strava_athlete_id bigint not null unique,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_expires_at timestamptz not null,
  scopes text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.strava_connections enable row level security;
create index strava_connections_profile_idx on public.strava_connections(profile_id);
create trigger strava_connections_updated_at before update on public.strava_connections
  for each row execute function public.set_updated_at();

-- Coaches may name imported trainings; older trainings keep their existing
-- focus-derived heading until a title is entered.
alter table public.training_rides add column if not exists title text;

-- Distinguish imported values from coach-entered values for disconnect/deletion.
alter table public.ride_entries add column if not exists strava_imported boolean not null default false;

-- Each rider can have a different Strava activity in the same training.
-- The columns already exist on ride_entries; this index prevents duplicate
-- automated imports without constraining older coach-entered records.
create unique index if not exists ride_entries_athlete_strava_unique
  on public.ride_entries(athlete_id, strava_activity_id)
  where strava_imported = true and strava_activity_id is not null;
