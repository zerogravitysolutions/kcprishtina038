-- Imported groups are saved immediately for coach review. Late members of an
-- approved group remain hidden until the coach approves those entries.
alter table public.training_rides
  add column review_status text not null default 'approved'
    check (review_status in ('approved', 'under_review')),
  add column has_pending_changes boolean not null default false;
alter table public.ride_entries
  add column review_status text not null default 'approved'
    check (review_status in ('approved', 'under_review'));
create index training_rides_review_idx on public.training_rides(review_status, ride_date desc);
create index ride_entries_review_idx on public.ride_entries(review_status, ride_id);

-- Keep a published training visible when a late rider is appended. The trigger
-- derives its review badge from pending entries and serializes with approval.
create or replace function public.sync_training_pending_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ride_id uuid;
begin
  v_ride_id := case when tg_op = 'DELETE' then old.ride_id else new.ride_id end;
  update public.training_rides r
  set has_pending_changes = exists (
    select 1 from public.ride_entries e
    where e.ride_id = v_ride_id and e.review_status = 'under_review'
  )
  where r.id = v_ride_id and r.review_status = 'approved';
  return null;
end;
$$;
create trigger ride_entries_pending_review
  after insert or update of review_status or delete on public.ride_entries
  for each row execute function public.sync_training_pending_changes();

create or replace function public.approve_strava_review(p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_kind public.training_ride_kind;
begin
  if not public.has_role(array['admin','editor','staff','coach']::public.user_role[]) then
    raise exception 'Coach access required';
  end if;
  select review_status, kind into v_status, v_kind from public.training_rides
    where id = p_ride_id for update;
  if not found then raise exception 'Training not found'; end if;
  if (select count(*) from public.ride_entries where ride_id = p_ride_id) <
      case when v_kind = 'solo' then 1 else 2 end then
    raise exception 'Training has too few riders';
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
revoke all on function public.approve_strava_review(uuid) from public, anon;
grant execute on function public.approve_strava_review(uuid) to authenticated;

-- Rejecting a proposal suppresses the same activities on later Strava updates.
create table public.strava_review_rejections (
  athlete_id uuid not null references public.team_members(id) on delete cascade,
  strava_activity_id bigint not null,
  rejected_at timestamptz not null default now(),
  primary key (athlete_id, strava_activity_id)
);
alter table public.strava_review_rejections enable row level security;

-- Strava expects a prompt webhook response. The webhook only writes this queue;
-- a scheduled worker fetches details and retries failures. GPS tracks are never
-- persisted here.
create table public.strava_activity_events (
  event_kind text not null default 'upsert' check (event_kind in ('upsert', 'delete', 'revoke')),
  activity_id bigint not null,
  owner_id bigint not null,
  event_time bigint not null,
  processed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (event_kind, activity_id)
);
alter table public.strava_activity_events enable row level security;
create index strava_activity_events_due_idx
  on public.strava_activity_events(next_attempt_at, created_at)
  where processed_at is null;

create or replace function public.claim_strava_activity_events(batch_size integer default 5)
returns setof public.strava_activity_events
language sql security definer set search_path = public as $$
  update public.strava_activity_events e
  set claimed_until = now() + interval '5 minutes', attempts = e.attempts + 1
  where (e.event_kind, e.activity_id) in (
    select event_kind, activity_id from public.strava_activity_events
    where processed_at is null and next_attempt_at <= now()
      and (claimed_until is null or claimed_until < now())
    order by next_attempt_at, created_at
    for update skip locked
    limit least(greatest(batch_size, 1), 20)
  )
  returning e.*;
$$;
revoke all on function public.claim_strava_activity_events(integer) from public, anon, authenticated;
grant execute on function public.claim_strava_activity_events(integer) to service_role;

-- Cyclists see only approved entries; an approved group can stay visible while
-- a later uploaded rider waits for the coach's review.
drop policy ride_entries_select_own on public.ride_entries;
create policy ride_entries_select_own on public.ride_entries
  for select to authenticated
  using (athlete_id = any(public.my_athlete_ids()) and review_status = 'approved');

create or replace function public.my_ride_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct e.ride_id), '{}'::uuid[])
  from public.ride_entries e
  join public.training_rides r on r.id = e.ride_id
  where e.athlete_id = any(public.my_athlete_ids())
    and e.review_status = 'approved' and r.review_status = 'approved';
$$;
