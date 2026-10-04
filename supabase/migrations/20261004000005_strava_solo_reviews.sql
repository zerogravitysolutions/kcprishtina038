-- A cyclist's ride can be reviewed on its own. A matching rider may join later.
create or replace function public.approve_strava_review(p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_role(array['admin','editor','staff','coach']::public.user_role[]) then
    raise exception 'Coach access required';
  end if;
  select review_status into v_status from public.training_rides
    where id = p_ride_id for update;
  if not found then raise exception 'Training not found'; end if;
  if not exists (select 1 from public.ride_entries where ride_id = p_ride_id) then
    raise exception 'Training needs a rider';
  end if;
  if not exists (select 1 from public.ride_entries
      where ride_id = p_ride_id and review_status = 'under_review') then
    raise exception 'Nothing to review';
  end if;
  insert into public.athlete_profiles(athlete_id, ftp_w, ftp_updated_at, updated_by)
  select e.athlete_id, e.ftp_w, r.ride_date, auth.uid()
  from public.ride_entries e join public.training_rides r on r.id = e.ride_id
  where e.ride_id = p_ride_id and e.review_status = 'under_review'
    and e.set_ftp and e.ftp_w is not null
  on conflict (athlete_id) do update set
    ftp_w = excluded.ftp_w, ftp_updated_at = excluded.ftp_updated_at,
    updated_by = excluded.updated_by;
  update public.ride_entries set review_status = 'approved'
    where ride_id = p_ride_id and review_status = 'under_review';
  update public.training_rides
    set review_status = 'approved', has_pending_changes = false
    where id = p_ride_id;
end;
$$;

-- Merge separately proposed solo rides when a later Strava update reveals
-- that they satisfy the group checks. The caller verifies the route/time match.
create function public.merge_strava_singleton(p_target_ride_id uuid, p_source_ride_id uuid)
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
  update public.training_rides r set kind = 'group',
    has_pending_changes = r.review_status = 'approved' and exists (
      select 1 from public.ride_entries e
      where e.ride_id = p_target_ride_id and e.review_status = 'under_review'
    )
  where r.id = p_target_ride_id;
  return true;
end;
$$;
revoke all on function public.merge_strava_singleton(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_strava_singleton(uuid, uuid) to service_role;
