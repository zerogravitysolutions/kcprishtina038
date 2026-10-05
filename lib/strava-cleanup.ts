import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Remove imported entries (and now-empty sessions) after revocation or deletion. */
export async function removeImportedStravaData(athleteId: string, activityId?: number,
  options: { keepCache?: boolean } = {}): Promise<void> {
  const admin = createAdminClient();
  if (!options.keepCache) {
    let cache = admin.from("strava_activities").delete().eq("athlete_id", athleteId);
    if (activityId !== undefined) cache = cache.eq("activity_id", activityId);
    const { error: cacheError } = await cache;
    if (cacheError) throw cacheError;
  }
  let segments = admin.from("strava_segment_efforts").delete().eq("athlete_id", athleteId);
  if (activityId !== undefined) segments = segments.eq("strava_activity_id", activityId);
  const { error: segmentError } = await segments;
  if (segmentError) throw segmentError;
  let fortyKm = admin.from("strava_40km_efforts").delete().eq("athlete_id", athleteId);
  if (activityId !== undefined) fortyKm = fortyKm.eq("strava_activity_id", activityId);
  const { error: fortyKmError } = await fortyKm;
  if (fortyKmError) throw fortyKmError;
  if (activityId === undefined) {
    const [{ error: statsError }, { error: backfillError }, { error: fortyKmBackfillError }] = await Promise.all([
      admin.from("strava_segment_stats").delete().eq("athlete_id", athleteId),
      admin.from("strava_segment_backfills").delete().eq("athlete_id", athleteId),
      admin.from("strava_40km_backfills").delete().eq("athlete_id", athleteId),
    ]);
    if (statsError || backfillError || fortyKmBackfillError) throw statsError ?? backfillError ?? fortyKmBackfillError;
  }
  await removeImportedTrainingData(athleteId, activityId);
}

/** Remove an imported training after an activity edit makes the ride too short.
 * Segment and 40 km performance data remain available to the coach. */
export async function removeStravaTraining(athleteId: string, activityId: number): Promise<void> {
  await removeImportedTrainingData(athleteId, activityId);
}

async function removeImportedTrainingData(athleteId: string, activityId?: number): Promise<void> {
  const admin = createAdminClient();
  let query = admin.from("ride_entries").select("id, ride_id")
    .eq("athlete_id", athleteId).eq("strava_imported", true);
  if (activityId !== undefined) query = query.eq("strava_activity_id", activityId);
  const { data: entries, error } = await query;
  if (error) throw error;
  if (!entries?.length) return;
  const { error: deleteError } = await admin.from("ride_entries")
    .delete().in("id", entries.map((entry) => entry.id));
  if (deleteError) throw deleteError;
  for (const rideId of new Set(entries.map((entry) => entry.ride_id))) {
    const { data: remaining, error: remainingError } = await admin.from("ride_entries")
      .select("distance_km, moving_seconds, elevation_m, strava_url, strava_imported").eq("ride_id", rideId);
    if (remainingError) throw remainingError;
    if (!remaining?.length) {
      const { error: rideError } = await admin.from("training_rides").delete().eq("id", rideId);
      if (rideError) throw rideError;
    } else {
      const median = (key: "distance_km" | "moving_seconds" | "elevation_m") => {
        const values = remaining.map((entry) => entry[key]).filter((value): value is number => value !== null).sort((a, b) => a - b);
        return values.length ? values[Math.floor(values.length / 2)] : null;
      };
      const { error: updateError } = await admin.from("training_rides").update({
        kind: remaining.length === 1 ? "solo" : "group",
        distance_km: median("distance_km"), moving_seconds: median("moving_seconds"), elevation_m: median("elevation_m"),
        strava_url: remaining.find((entry) => entry.strava_imported && entry.strava_url)?.strava_url ?? null,
      }).eq("id", rideId);
      if (updateError) throw updateError;
    }
  }
}
