import "server-only";

// Each Strava activity is read once. Its trimmed detail is stored in
// strava_activities and reused by grouping, segment sync, retries and history
// scans, so the club stays inside Strava's rate limits.

import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaAthlete, type StravaConnection, type StravaSegmentEffort } from "@/lib/strava-api";
import { cyclingMode } from "@/lib/strava-cycling";
import { decodePolyline, type LatLng } from "@/lib/strava-match";
import type { PowerStreams } from "@/lib/strava-metrics";
import type { DistanceStreams } from "@/lib/strava-forty-km";

export type ActivityStreams = PowerStreams & DistanceStreams;
export type CachedActivity = { athleteId: string; activity: StravaActivity; fetchedAt: string | null; fortyKmChecked: boolean };

const FTP_MAX_AGE_MS = 24 * 3600_000;

function trimEffort(effort: StravaSegmentEffort): StravaSegmentEffort {
  return {
    id: effort.id, segment: effort.segment ? { id: effort.segment.id } : undefined,
    activity: effort.activity ? { id: effort.activity.id } : undefined,
    start_date: effort.start_date, start_date_local: effort.start_date_local,
    elapsed_time: effort.elapsed_time, moving_time: effort.moving_time, distance: effort.distance,
    average_watts: effort.average_watts, average_heartrate: effort.average_heartrate,
    max_heartrate: effort.max_heartrate, average_cadence: effort.average_cadence,
    device_watts: effort.device_watts, pr_rank: effort.pr_rank ?? null,
  };
}

/** Keep only the fields the app reads; everything else stays on Strava. */
function trimActivity(activity: StravaActivity): StravaActivity {
  return {
    id: activity.id, name: activity.name, sport_type: activity.sport_type, trainer: activity.trainer,
    start_date: activity.start_date, start_date_local: activity.start_date_local,
    distance: activity.distance, moving_time: activity.moving_time, elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    average_heartrate: activity.average_heartrate, max_heartrate: activity.max_heartrate,
    average_watts: activity.average_watts, weighted_average_watts: activity.weighted_average_watts,
    average_cadence: activity.average_cadence,
    athlete: activity.athlete ? { id: activity.athlete.id } : undefined,
    map: { polyline: activity.map?.polyline ?? activity.map?.summary_polyline ?? null },
    segment_efforts: (activity.segment_efforts ?? []).map(trimEffort),
  };
}

function fromRow(row: { athlete_id: string; detail: unknown; fetched_at: string | null; forty_km_checked: boolean }): CachedActivity | null {
  return row.detail ? {
    athleteId: row.athlete_id, activity: row.detail as StravaActivity,
    fetchedAt: row.fetched_at, fortyKmChecked: row.forty_km_checked,
  } : null;
}

export async function cachedActivity(activityId: number): Promise<CachedActivity | null> {
  const { data, error } = await createAdminClient().from("strava_activities")
    .select("athlete_id, detail, fetched_at, forty_km_checked").eq("activity_id", activityId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/** Read the activity from Strava and store it. Returns null when Strava no
 * longer has it (404) or it belongs to another athlete. */
export async function fetchActivity(connection: StravaConnection, activityId: number): Promise<StravaActivity | null> {
  let activity: StravaActivity;
  try { activity = await stravaGet<StravaActivity>(connection, `/activities/${activityId}?include_all_efforts=true`); }
  catch (error) {
    if (error instanceof Error && error.message === "Strava API: 404") return null;
    throw error;
  }
  if (activity.id !== activityId || activity.athlete?.id !== connection.strava_athlete_id) return null;
  const trimmed = trimActivity(activity);
  const { error } = await createAdminClient().from("strava_activities").upsert({
    activity_id: activityId, athlete_id: connection.athlete_id, started_at: trimmed.start_date,
    mode: cyclingMode(trimmed), detail: trimmed, fetched_at: new Date().toISOString(),
  }, { onConflict: "activity_id" });
  if (error) throw error;
  return trimmed;
}

/** Cached detail when we have it; otherwise one Strava read. */
export async function activityDetail(connection: StravaConnection, activityId: number): Promise<StravaActivity | null> {
  const cached = await cachedActivity(activityId);
  if (cached && cached.athleteId === connection.athlete_id) return cached.activity;
  return fetchActivity(connection, activityId);
}

/** Cached cycling activities of other riders that started near `startMs`. */
export async function cachedActivitiesNear(excludeAthleteId: string, startMs: number, windowMs: number,
  mode: "indoor" | "outdoor"): Promise<CachedActivity[]> {
  const { data, error } = await createAdminClient().from("strava_activities")
    .select("athlete_id, detail, fetched_at, forty_km_checked")
    .neq("athlete_id", excludeAthleteId).eq("mode", mode).not("detail", "is", null)
    .gte("started_at", new Date(startMs - windowMs).toISOString())
    .lte("started_at", new Date(startMs + windowMs).toISOString());
  if (error) throw error;
  return (data ?? []).flatMap((row) => fromRow(row) ?? []);
}

export async function markFortyKmChecked(connection: StravaConnection, activity: StravaActivity): Promise<void> {
  const { error } = await createAdminClient().from("strava_activities").upsert({
    activity_id: activity.id, athlete_id: connection.athlete_id, started_at: activity.start_date,
    mode: cyclingMode(activity), forty_km_checked: true,
  }, { onConflict: "activity_id" });
  if (error) throw error;
}

export async function fortyKmCheckedIds(athleteId: string, activityIds: number[]): Promise<Set<number>> {
  if (!activityIds.length) return new Set();
  const { data, error } = await createAdminClient().from("strava_activities").select("activity_id")
    .eq("athlete_id", athleteId).eq("forty_km_checked", true).in("activity_id", activityIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.activity_id));
}

/** One streams read serves both the power metrics and the 40 km window. */
export async function activityStreams(connection: StravaConnection, activityId: number): Promise<ActivityStreams> {
  return stravaGet<ActivityStreams>(connection,
    `/activities/${activityId}/streams?keys=time,watts,distance,moving&key_by_type=true`).catch((error: unknown) => {
      if (error instanceof Error && error.message === "Strava API: 404") return {} as ActivityStreams;
      throw error;
    });
}

/** Strava FTP and weight (need profile:read_all) and the profile photo from
 * the athlete profile, read at most once a day. */
export async function athleteFtp(connection: StravaConnection): Promise<number | null> {
  if (connection.strava_ftp_checked_at &&
      Date.now() - Date.parse(connection.strava_ftp_checked_at) < FTP_MAX_AGE_MS) return connection.strava_ftp_w;
  const athlete = await stravaGet<StravaAthlete>(connection, "/athlete");
  if (athlete.id === connection.strava_athlete_id) {
    const { syncStravaAvatar } = await import("@/lib/avatar");
    await syncStravaAvatar(connection, athlete.profile).catch((error: unknown) =>
      console.error("Strava profile photo sync failed", error));
  }
  const own = athlete.id === connection.strava_athlete_id;
  const ftp = own && typeof athlete.ftp === "number" ? athlete.ftp : null;
  const weight = own && typeof athlete.weight === "number" && athlete.weight > 0 ? Math.round(athlete.weight * 10) / 10 : null;
  const checkedAt = new Date().toISOString();
  const { error } = await createAdminClient().from("strava_connections")
    .update({ strava_ftp_w: ftp, strava_weight_kg: weight, strava_ftp_checked_at: checkedAt }).eq("athlete_id", connection.athlete_id);
  if (error) throw error;
  connection.strava_ftp_w = ftp;
  connection.strava_ftp_checked_at = checkedAt;
  return ftp;
}

/** Read each connected rider's Strava profile when it is due: daily, or
 * right away after connecting or removing a photo. */
export async function refreshStravaProfiles(onlyUnchecked = false): Promise<number> {
  let query = createAdminClient().from("strava_connections").select("*");
  query = onlyUnchecked ? query.is("strava_ftp_checked_at", null)
    : query.or(`strava_ftp_checked_at.is.null,strava_ftp_checked_at.lt.${new Date(Date.now() - FTP_MAX_AGE_MS).toISOString()}`);
  const { data, error } = await query;
  if (error) throw error;
  for (const connection of data ?? []) {
    try { await athleteFtp(connection); }
    catch (cause) {
      // Retry tomorrow instead of on every worker run.
      console.error("Strava profile refresh failed", { athleteId: connection.athlete_id, cause });
      const { error: markError } = await createAdminClient().from("strava_connections")
        .update({ strava_ftp_checked_at: new Date().toISOString() }).eq("athlete_id", connection.athlete_id);
      if (markError) throw markError;
    }
  }
  return data?.length ?? 0;
}

export function activityRoute(activity: StravaActivity): LatLng[] {
  return cyclingMode(activity) === "outdoor" ? decodePolyline(activity.map?.polyline) : [];
}
