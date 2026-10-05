-- A rider's FTP, max HR and weight now come from their activities and Strava
-- instead of typed-in profile values. Only the coach's notes stay on
-- athlete_profiles.

-- Each ride's FTP becomes 95% of the best 20-min power in the six weeks up to
-- and including that ride; IF and TSS follow it. Rides without power data in
-- that window keep their FTP.
with estimate as (
  select e.id, round(0.95 * max(o.best_power_20m_w)) as ftp
  from public.ride_entries e
  join public.training_rides r on r.id = e.ride_id
  join public.ride_entries o on o.athlete_id = e.athlete_id and o.participated and o.best_power_20m_w is not null
  join public.training_rides orr on orr.id = o.ride_id
    and orr.ride_date > r.ride_date - 42 and orr.ride_date <= r.ride_date
  group by e.id
)
update public.ride_entries e set
  ftp_w = estimate.ftp,
  intensity_factor = case when e.np_w is not null then round(e.np_w::numeric / estimate.ftp, 2) end,
  tss = case when e.np_w is not null and e.moving_seconds is not null
    then round(e.moving_seconds::numeric * e.np_w * e.np_w / (estimate.ftp * estimate.ftp * 3600) * 100) end
from estimate
where estimate.id = e.id and estimate.ftp > 0;

alter table public.ride_entries drop column set_ftp;
alter table public.athlete_profiles
  drop column ftp_w,
  drop column ftp_updated_at,
  drop column weight_kg,
  drop column max_hr,
  drop column resting_hr;

-- Weight from the rider's Strava profile (read with the daily athlete read).
alter table public.strava_connections add column strava_weight_kg numeric(5,1);
update public.strava_connections set strava_ftp_checked_at = null;
