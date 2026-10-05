-- Record which PR activity was inspected so missing or unavailable power does
-- not cause repeated Strava API requests on every scheduled sync.
alter table public.strava_segment_stats
  add column pr_detail_checked_activity_id bigint;
