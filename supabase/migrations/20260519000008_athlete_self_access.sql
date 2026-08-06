-- 0022 — Let a logged-in cyclist read their OWN training data.
--
-- A cyclist's login is a profiles row; their athlete record is the
-- team_members row whose profile_id = auth.uid() (linked in the team admin).
-- These add read-only self-access on top of the existing staff/coach policies;
-- a member with no linked team_member gets nothing (empty id array).

-- team_member ids linked to the current auth user.
create or replace function public.my_athlete_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}'::uuid[])
  from public.team_members
  where profile_id = auth.uid();
$$;

-- training_ride ids the current user participated in.
create or replace function public.my_ride_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ride_id), '{}'::uuid[])
  from public.ride_entries
  where athlete_id = any(public.my_athlete_ids());
$$;

-- Own ride entries.
create policy ride_entries_select_own on public.ride_entries
  for select to authenticated
  using (athlete_id = any(public.my_athlete_ids()));

-- Own performance profile.
create policy athlete_profiles_select_own on public.athlete_profiles
  for select to authenticated
  using (athlete_id = any(public.my_athlete_ids()));

-- The rides they took part in (for date / focus / section on their entries).
create policy training_rides_select_own on public.training_rides
  for select to authenticated
  using (id = any(public.my_ride_ids()));
