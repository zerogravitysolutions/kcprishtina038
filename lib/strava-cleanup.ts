import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Remove imported entries (and now-empty sessions) after revocation or deletion. */
export async function removeImportedStravaData(athleteId: string, activityId?: number): Promise<void> {
  const admin = createAdminClient();
  let segments = admin.from("strava_segment_efforts").delete().eq("athlete_id", athleteId);
  if (activityId !== undefined) segments = segments.eq("strava_activity_id", activityId);
  const { error: segmentError } = await segments;
  if (segmentError) throw segmentError;
  if (activityId === undefined) {
    const [{ error: statsError }, { error: backfillError }] = await Promise.all([
      admin.from("strava_segment_stats").delete().eq("athlete_id", athleteId),
      admin.from("strava_segment_backfills").delete().eq("athlete_id", athleteId),
    ]);
    if (statsError || backfillError) throw statsError ?? backfillError;
  }
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
      .select("distance_km, moving_seconds, elevation_m, strava_url, strava_imported, review_status").eq("ride_id", rideId);
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
