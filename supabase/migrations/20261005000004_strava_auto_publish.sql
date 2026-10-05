-- Strava trainings are published directly; the coach no longer approves them.
-- Pending proposals become regular trainings when the review columns are dropped.
drop trigger ride_entries_pending_review on public.ride_entries;
drop function public.sync_training_pending_changes();
drop function public.approve_strava_review(uuid);

drop policy ride_entries_select_own on public.ride_entries;
create policy ride_entries_select_own on public.ride_entries
  for select to authenticated
  using (athlete_id = any(public.my_athlete_ids()));

create or replace function public.my_ride_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ride_id), '{}'::uuid[])
  from public.ride_entries
  where athlete_id = any(public.my_athlete_ids());
$$;

-- Merge separately imported solo rides when a later Strava update reveals
-- that they satisfy the group checks. The caller verifies the route/time match.
create or replace function public.merge_strava_singleton(p_target_ride_id uuid, p_source_ride_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_entry public.ride_entries%rowtype;
begin
  if p_target_ride_id = p_source_ride_id then return false; end if;
  perform 1 from public.training_rides
    where id in (p_target_ride_id, p_source_ride_id)
    order by id for update;
  if (select count(*) from public.training_rides
      where id in (p_target_ride_id, p_source_ride_id)) <> 2 then return false; end if;
  if (select count(*) from public.ride_entries where ride_id = p_source_ride_id) <> 1 then return false; end if;
  select * into v_entry from public.ride_entries where ride_id = p_source_ride_id for update;
  if not v_entry.strava_imported or v_entry.strava_activity_id is null then return false; end if;
  if exists (select 1 from public.ride_entries
      where ride_id = p_target_ride_id and athlete_id = v_entry.athlete_id) then return false; end if;

  update public.ride_entries set ride_id = p_target_ride_id where id = v_entry.id;
  delete from public.training_rides where id = p_source_ride_id;
  update public.training_rides set kind = 'group' where id = p_target_ride_id;
  return true;
end;
$$;

alter table public.training_rides
  drop column review_status,
  drop column has_pending_changes;
alter table public.ride_entries drop column review_status;

-- Activities whose imported training the coach deleted; later Strava updates
-- must not recreate them.
alter table public.strava_review_rejections rename to strava_dismissed_activities;
alter table public.strava_dismissed_activities rename column rejected_at to dismissed_at;
