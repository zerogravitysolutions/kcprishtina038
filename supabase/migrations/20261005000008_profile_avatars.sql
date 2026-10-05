-- Profile photos: copied from Strava on connect (and refreshed with the daily
-- athlete read) or uploaded by the member. Files live in the public avatars
-- bucket under "<profile id>/".
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'avatars';

-- The Strava photo URL last copied, so an unchanged photo is not re-downloaded.
alter table public.strava_connections add column strava_avatar_url text;
-- Read the athlete profile (and its photo) for already connected riders now.
update public.strava_connections set strava_ftp_checked_at = null;

-- The queue worker also wakes when a rider's Strava profile is due right away
-- (just connected, photo removed, or this migration).
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
  ) or exists (
    select 1 from public.strava_connections c where c.strava_ftp_checked_at is null
  );
  $$
);
