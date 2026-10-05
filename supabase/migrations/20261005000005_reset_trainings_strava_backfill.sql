-- Start the training history over from Strava (July 2026 onward). The old
-- rows are kept in service-only backup tables in case anything is needed.
create table public.training_rides_backup_20261005 as table public.training_rides;
create table public.ride_entries_backup_20261005 as table public.ride_entries;
alter table public.training_rides_backup_20261005 enable row level security;
alter table public.ride_entries_backup_20261005 enable row level security;

delete from public.training_rides; -- ride_entries cascade
delete from public.strava_dismissed_activities;
-- Processed upsert events would make the rescan skip these activities.
delete from public.strava_activity_events where event_kind = 'upsert' and processed_at is not null;

-- pg_cron drains the Strava queue through the app; the secret never leaves
-- this service-only table.
create table public.strava_queue_worker (
  id boolean primary key default true check (id),
  secret text not null,
  rescan_from date
);
alter table public.strava_queue_worker enable row level security;
insert into public.strava_queue_worker(secret, rescan_from)
values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), '2026-07-01');

select cron.schedule(
  'strava-queue-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://kcprishtina038.vercel.app/api/strava/queue',
    headers := jsonb_build_object('content-type', 'application/json', 'x-queue-secret', w.secret),
    body    := '{}'::jsonb
  )
  from public.strava_queue_worker w
  where w.rescan_from is not null or exists (
    select 1 from public.strava_activity_events e
    where e.processed_at is null and e.next_attempt_at <= now()
      and (e.claimed_until is null or e.claimed_until < now())
  );
  $$
);
