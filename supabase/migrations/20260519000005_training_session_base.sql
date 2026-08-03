-- 0019 — Session-level "Bazë" defaults on a training ride.
--
-- Distance / duration / elevation are usually shared by the whole group (same
-- route), so they're entered once on the ride ("part of the exercise") and
-- inherited into each rider's ride_entry — still editable per rider. These
-- columns are the template/default; the per-athlete values on ride_entries
-- remain the source of truth for all stats and aggregation.
--
-- Follow-up to 20260519000004 (which is already applied); do not edit that one.

alter table public.training_rides
  add column if not exists distance_km    numeric(6,2) check (distance_km is null or distance_km >= 0),
  add column if not exists moving_seconds integer      check (moving_seconds is null or moving_seconds >= 0),
  add column if not exists elevation_m    integer      check (elevation_m is null or elevation_m >= 0);

-- The 'kind' column (group/solo) is now unused by the app — a ride is just a
-- set of 1+ riders — but it's kept (nullable default 'group') to avoid a
-- destructive drop; no code reads it anymore.
