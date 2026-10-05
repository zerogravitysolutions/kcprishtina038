import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaConnection } from "@/lib/strava-api";
import { cyclingMode } from "@/lib/strava-cycling";
import { bestFortyKm, FORTY_KM_METERS, type DistanceStreams } from "@/lib/strava-forty-km";

/** Save only the derived fastest window, never the raw activity streams. */
export async function syncFortyKmEffort(connection: StravaConnection, activity: StravaActivity): Promise<boolean> {
  const admin = createAdminClient();
  const remove = async () => {
    const { error } = await admin.from("strava_40km_efforts").delete()
      .eq("athlete_id", connection.athlete_id).eq("strava_activity_id", activity.id);
    if (error) throw error;
  };
  if (!cyclingMode(activity) || activity.distance < FORTY_KM_METERS) {
    await remove();
    return false;
  }
  let streams: DistanceStreams;
  try {
    streams = await stravaGet<DistanceStreams>(connection,
      `/activities/${activity.id}/streams?keys=time,distance,moving&key_by_type=true`);
  } catch (error) {
    if (!(error instanceof Error && error.message === "Strava API: 404")) throw error;
    await remove();
    return false;
  }
  const window = bestFortyKm(streams);
  if (!window) {
    await remove();
    return false;
  }
  const { error } = await admin.from("strava_40km_efforts").upsert({
    athlete_id: connection.athlete_id, strava_activity_id: activity.id,
    ride_started_at: activity.start_date, ride_date: activity.start_date_local.slice(0, 10),
    duration_seconds: window.durationSeconds, elapsed_seconds: window.elapsedSeconds,
    window_start_seconds: window.startSecond, window_end_seconds: window.endSecond,
    uses_moving_time: window.usesMovingTime, updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_id,strava_activity_id" });
  if (error) throw error;
  return true;
}

export async function ensureFortyKmBackfill(athleteId: string): Promise<void> {
  const { error } = await createAdminClient().from("strava_40km_backfills").upsert({
    athlete_id: athleteId, cursor_before: Math.floor(Date.now() / 1000) + 1,
  }, { onConflict: "athlete_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function processFortyKmBackfills(): Promise<{ riders: number; rides: number; completed: number }> {
  const admin = createAdminClient();
  const [{ data: links, error: linkError }, { data: existing, error: jobError }] = await Promise.all([
    admin.from("strava_connections").select("*"),
    admin.from("strava_40km_backfills").select("athlete_id"),
  ]);
  if (linkError || jobError) throw linkError ?? jobError;
  const jobs = new Set((existing ?? []).map((job) => job.athlete_id));
  for (const link of links ?? []) if (!jobs.has(link.athlete_id)) await ensureFortyKmBackfill(link.athlete_id);

  const { data: pending, error: pendingError } = await admin.from("strava_40km_backfills")
    .select("*").eq("completed", false).order("updated_at").limit(1);
  if (pendingError) throw pendingError;
  let rides = 0, completed = 0;
  for (const job of pending ?? []) {
    const connection = (links ?? []).find((link) => link.athlete_id === job.athlete_id);
    if (!connection) {
      const { error } = await admin.from("strava_40km_backfills").delete().eq("athlete_id", job.athlete_id);
      if (error) throw error;
      continue;
    }
    const activities = await stravaGet<StravaActivity[]>(connection,
      `/athlete/activities?before=${job.cursor_before}&per_page=75&page=1`);
    const eligible = activities.filter((activity) => cyclingMode(activity) && activity.distance >= FORTY_KM_METERS);
    for (let i = 0; i < eligible.length; i += 4) {
      const saved = await Promise.all(eligible.slice(i, i + 4).map((activity) => syncFortyKmEffort(connection, activity)));
      rides += saved.filter(Boolean).length;
    }
    const cursor = activities.length
      ? Math.floor(Date.parse(activities[activities.length - 1].start_date) / 1000) - 1
      : job.cursor_before;
    const done = activities.length < 75;
    const { error } = await admin.from("strava_40km_backfills").update({
      cursor_before: cursor, completed: done, updated_at: new Date().toISOString(),
    }).eq("athlete_id", job.athlete_id);
    if (error) throw error;
    if (done) completed++;
  }
  return { riders: pending?.length ?? 0, rides, completed };
}
