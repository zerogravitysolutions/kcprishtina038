-- 0020 — Strava link at the exercise (ride) level.
--
-- The activity link belongs to the whole exercise, not each rider — one shared
-- link per training. (ride_entries.strava_url stays in place but is no longer
-- used by the app.)

alter table public.training_rides
  add column if not exists strava_url         text,
  add column if not exists strava_activity_id bigint;
