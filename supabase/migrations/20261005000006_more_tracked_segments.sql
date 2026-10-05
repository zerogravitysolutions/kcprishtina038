-- New tracked segments (Germia Suffer Test, Siqeva Climb, Graštica - Kolic,
-- Prison Wall) need a fresh history scan for riders without the efforts API.
delete from public.strava_segment_backfills;
alter table public.strava_queue_worker add column segments_refresh boolean not null default false;
update public.strava_queue_worker set segments_refresh = true;

-- Same job, now also woken for segment refreshes and history scans. A scan
-- runs at most every 15 minutes to stay inside Strava's read limit.
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
  where w.rescan_from is not null or w.segments_refresh or exists (
    select 1 from public.strava_activity_events e
    where e.processed_at is null and e.next_attempt_at <= now()
      and (e.claimed_until is null or e.claimed_until < now())
  ) or exists (
    select 1 from public.strava_segment_backfills b
    where not b.completed and b.updated_at < now() - interval '15 minutes'
  );
  $$
);
