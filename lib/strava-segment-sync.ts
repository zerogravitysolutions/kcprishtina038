import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaConnection, type StravaSegmentEffort } from "@/lib/strava-api";
import { cyclingMode } from "@/lib/strava-cycling";
import { TRACKED_SEGMENTS } from "@/lib/segment-leaderboard";
import type { TableInsert } from "@/lib/supabase/types";

const SEGMENT_IDS = new Set<number>(TRACKED_SEGMENTS.map((segment) => segment.id));
const FIRST_STRAVA_YEAR = 2009;

type SegmentSummary = {
  id: number;
  athlete_segment_stats?: {
    pr_elapsed_time?: number;
    pr_date?: string;
    pr_activity_id?: number;
    effort_count?: number;
  } | null;
};

function positive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function effortRow(athleteId: string, activityId: number, effort: StravaSegmentEffort): TableInsert<"strava_segment_efforts"> {
  return {
    athlete_id: athleteId, strava_activity_id: activityId,
    segment_id: effort.segment!.id,
    started_at: effort.start_date, local_date: effort.start_date_local.slice(0, 10),
    elapsed_seconds: effort.elapsed_time, moving_seconds: numberOrNull(effort.moving_time),
    distance_m: numberOrNull(effort.distance), avg_power_w: numberOrNull(effort.average_watts),
    avg_hr: numberOrNull(effort.average_heartrate), max_hr: numberOrNull(effort.max_heartrate),
    avg_cadence: numberOrNull(effort.average_cadence), device_watts: effort.device_watts ?? null,
  };
}

/** Replaces only this activity's tracked efforts; edits or duplicate webhooks
 * cannot leave a stale attempt in the coach rankings. */
export async function syncSegmentEffortsFromActivity(athleteId: string, activity: StravaActivity): Promise<number[]> {
  const admin = createAdminClient();
  const current = (activity.segment_efforts ?? []).filter((effort) =>
    effort.segment?.id && SEGMENT_IDS.has(effort.segment.id) &&
    positive(effort.elapsed_time) &&
    !!effort.start_date && !!effort.start_date_local);
  const { data: previous, error: previousError } = await admin.from("strava_segment_efforts")
    .select("segment_id, started_at").eq("athlete_id", athleteId).eq("strava_activity_id", activity.id);
  if (previousError) throw previousError;
  if (current.length) {
    const { error } = await admin.from("strava_segment_efforts").upsert(
      current.map((effort) => effortRow(athleteId, activity.id, effort)),
      { onConflict: "athlete_id,strava_activity_id,segment_id,started_at" });
    if (error) throw error;
  }
  const currentKeys = new Set(current.map((effort) => `${effort.segment!.id}:${Date.parse(effort.start_date)}`));
  for (const stale of (previous ?? []).filter((effort) => !currentKeys.has(`${effort.segment_id}:${Date.parse(effort.started_at)}`))) {
    const { error } = await admin.from("strava_segment_efforts").delete()
      .eq("athlete_id", athleteId).eq("strava_activity_id", activity.id)
      .eq("segment_id", stale.segment_id).eq("started_at", stale.started_at);
    if (error) throw error;
  }
  return [...new Set([...current.map((effort) => effort.segment!.id), ...(previous ?? []).map((effort) => effort.segment_id)])];
}

export async function refreshSegmentSummary(connection: StravaConnection, segmentId: number): Promise<number> {
  const admin = createAdminClient();
  const data = await stravaGet<SegmentSummary>(connection, `/segments/${segmentId}`);
  const pr = data.athlete_segment_stats;
  const { data: existing, error: readError } = await admin.from("strava_segment_stats")
    .select("pr_detail_checked_activity_id").eq("athlete_id", connection.athlete_id)
    .eq("segment_id", segmentId).maybeSingle();
  if (readError) throw readError;
  const { error } = await admin.from("strava_segment_stats").upsert({
    athlete_id: connection.athlete_id, segment_id: segmentId,
    pr_activity_id: pr?.pr_activity_id ?? null,
    pr_elapsed_seconds: positive(pr?.pr_elapsed_time),
    pr_date: pr?.pr_date?.slice(0, 10) ?? null,
    effort_count: numberOrNull(pr?.effort_count),
    pr_detail_checked_activity_id: existing?.pr_detail_checked_activity_id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_id,segment_id" });
  if (error) throw error;
  return pr?.effort_count ?? 0;
}

/** Get the actual PB effort's watts and other measurements from its activity.
 * Segment summaries contain only the PR time, date, and activity ID. */
async function refreshPbDetailsForConnection(connection: StravaConnection, segmentId: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data: stat, error: statError } = await admin.from("strava_segment_stats")
    .select("pr_activity_id, pr_elapsed_seconds, pr_detail_checked_activity_id")
    .eq("athlete_id", connection.athlete_id).eq("segment_id", segmentId).maybeSingle();
  if (statError) throw statError;
  if (!stat?.pr_activity_id || !stat.pr_elapsed_seconds ||
      stat.pr_detail_checked_activity_id === stat.pr_activity_id) return false;

  const { data: saved, error: savedError } = await admin.from("strava_segment_efforts")
    .select("strava_activity_id, avg_power_w").eq("athlete_id", connection.athlete_id)
    .eq("segment_id", segmentId).eq("strava_activity_id", stat.pr_activity_id)
    .eq("elapsed_seconds", stat.pr_elapsed_seconds).limit(1);
  if (savedError) throw savedError;
  if (!saved?.some((effort) => effort.avg_power_w != null)) {
    try {
      const activity = await stravaGet<StravaActivity>(connection,
        `/activities/${stat.pr_activity_id}?include_all_efforts=true`);
      if (activity.id === stat.pr_activity_id &&
          activity.athlete?.id === connection.strava_athlete_id && cyclingMode(activity) &&
          activity.segment_efforts?.some((effort) => effort.segment?.id === segmentId &&
            effort.elapsed_time === stat.pr_elapsed_seconds)) {
        await syncSegmentEffortsFromActivity(connection.athlete_id, activity);
      }
    } catch (error) {
      if (!(error instanceof Error && ["Strava API: 403", "Strava API: 404"].includes(error.message))) throw error;
    }
  }
  const { error: updateError } = await admin.from("strava_segment_stats")
    .update({ pr_detail_checked_activity_id: stat.pr_activity_id })
    .eq("athlete_id", connection.athlete_id).eq("segment_id", segmentId)
    .eq("pr_activity_id", stat.pr_activity_id);
  if (updateError) throw updateError;
  return true;
}

async function effortsInRange(connection: StravaConnection, segmentId: number, start: string, end: string) {
  const query = new URLSearchParams({
    segment_id: String(segmentId), start_date_local: start, end_date_local: end, per_page: "200",
  });
  return stravaGet<StravaSegmentEffort[]>(connection, `/segment_efforts?${query}`);
}

async function latestInRange(connection: StravaConnection, segmentId: number, start: string, end: string): Promise<StravaSegmentEffort | null> {
  const efforts = await effortsInRange(connection, segmentId, start, end);
  if (efforts.length < 200) return efforts.sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;
  // Strava sorts this endpoint by fastest time, so a full page may exclude the
  // newest attempt. Split the date window and inspect the newer half first.
  const startMs = Date.parse(start), endMs = Date.parse(end);
  if (endMs - startMs <= 24 * 3600_000) return efforts.sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;
  const mid = new Date(Math.floor((startMs + endMs) / (2 * 24 * 3600_000)) * 24 * 3600_000).toISOString().slice(0, 10);
  const newer = await latestInRange(connection, segmentId, mid, end);
  return newer ?? latestInRange(connection, segmentId, start, mid);
}

async function latestEffort(connection: StravaConnection, segmentId: number): Promise<StravaSegmentEffort | null> {
  const currentYear = new Date().getUTCFullYear();
  for (let year = currentYear; year >= FIRST_STRAVA_YEAR; year--) {
    const effort = await latestInRange(connection, segmentId, `${year}-01-01`, `${year + 1}-01-01`);
    if (effort) return effort;
  }
  return null;
}

/** Two all-time PR summaries plus the newest effort for each tracked segment.
 * The effort-list endpoint is subscription-gated; other riders get a bounded
 * activity-history scan via the scheduled worker. */
export async function refreshTrackedSegmentsForConnection(connection: StravaConnection): Promise<void> {
  let needsFallback = false;
  for (const segment of TRACKED_SEGMENTS) {
    const count = await refreshSegmentSummary(connection, segment.id);
    if (!count) continue;
    await refreshPbDetailsForConnection(connection, segment.id);
    try {
      const effort = await latestEffort(connection, segment.id);
      if (effort?.segment?.id === segment.id && positive(effort.elapsed_time) &&
          effort.activity?.id && effort.start_date && effort.start_date_local) {
        const { error } = await createAdminClient().from("strava_segment_efforts").upsert(
          effortRow(connection.athlete_id, effort.activity.id, effort),
          { onConflict: "athlete_id,strava_activity_id,segment_id,started_at" });
        if (error) throw error;
      }
    } catch (error) {
      if (error instanceof Error && (error.message === "Strava API: 403" || error.message === "Strava API: 402")) {
        needsFallback = true;
        continue;
      }
      throw error;
    }
  }
  const admin = createAdminClient();
  if (needsFallback) {
    const { error } = await admin.from("strava_segment_backfills").upsert({
      athlete_id: connection.athlete_id, cursor_before: Math.floor(Date.now() / 1000) + 1,
    }, { onConflict: "athlete_id", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await admin.from("strava_segment_backfills").delete().eq("athlete_id", connection.athlete_id);
    if (error) throw error;
  }
}

/** Fill PB metrics for already connected riders in bounded daily batches. */
export async function refreshMissingPbDetails(): Promise<number> {
  const admin = createAdminClient();
  const [{ data: stats, error: statsError }, { data: links, error: linksError }] = await Promise.all([
    admin.from("strava_segment_stats").select("athlete_id, segment_id, pr_activity_id, pr_detail_checked_activity_id")
      .not("pr_activity_id", "is", null),
    admin.from("strava_connections").select("*"),
  ]);
  if (statsError || linksError) throw statsError ?? linksError;
  const connections = new Map((links ?? []).map((link) => [link.athlete_id, link]));
  let refreshed = 0;
  for (const stat of stats ?? []) {
    if (refreshed >= 2) break;
    if (stat.pr_detail_checked_activity_id === stat.pr_activity_id) continue;
    const connection = connections.get(stat.athlete_id);
    if (connection && await refreshPbDetailsForConnection(connection, stat.segment_id)) refreshed++;
  }
  return refreshed;
}

export async function refreshMissingSegmentSummaries(): Promise<number> {
  const admin = createAdminClient();
  const [{ data: links, error: linkError }, { data: rows, error: statsError }] = await Promise.all([
    admin.from("strava_connections").select("*"),
    admin.from("strava_segment_stats").select("athlete_id, segment_id"),
  ]);
  if (linkError || statsError) throw linkError ?? statsError;
  const available = new Set((rows ?? []).map((row) => `${row.athlete_id}:${row.segment_id}`));
  let refreshed = 0;
  for (const connection of links ?? []) {
    if (TRACKED_SEGMENTS.every((segment) => available.has(`${connection.athlete_id}:${segment.id}`))) continue;
    await refreshTrackedSegmentsForConnection(connection);
    refreshed++;
  }
  return refreshed;
}

/** Continue non-subscriber history scans without exceeding a single cron run. */
export async function processSegmentBackfills(): Promise<number> {
  const admin = createAdminClient();
  const { data: jobs, error: jobError } = await admin.from("strava_segment_backfills")
    .select("*").eq("completed", false).order("updated_at").limit(2);
  if (jobError) throw jobError;
  let scanned = 0;
  for (const job of jobs ?? []) {
    const { data: connection, error: linkError } = await admin.from("strava_connections")
      .select("*").eq("athlete_id", job.athlete_id).maybeSingle();
    if (linkError) throw linkError;
    if (!connection) {
      await admin.from("strava_segment_backfills").delete().eq("athlete_id", job.athlete_id);
      continue;
    }
    const rows = await stravaGet<StravaActivity[]>(connection,
      `/athlete/activities?before=${job.cursor_before}&per_page=30&page=1`);
    const rides = rows.filter((summary) => cyclingMode(summary));
    for (let index = 0; index < rides.length; index += 4) {
      const saved = await Promise.all(rides.slice(index, index + 4).map(async (summary) => {
        const activity = await stravaGet<StravaActivity>(connection, `/activities/${summary.id}`);
        if (activity.athlete?.id !== connection.strava_athlete_id || !cyclingMode(activity)) return 0;
        await syncSegmentEffortsFromActivity(connection.athlete_id, activity);
        return 1;
      }));
      scanned += saved.reduce<number>((total, count) => total + count, 0);
    }
    const cursor = rows.length ? Math.floor(Date.parse(rows[rows.length - 1].start_date) / 1000) - 1 : job.cursor_before;
    const { error } = await admin.from("strava_segment_backfills").update({
      cursor_before: cursor, completed: rows.length < 30, updated_at: new Date().toISOString(),
    }).eq("athlete_id", job.athlete_id);
    if (error) throw error;
  }
  return scanned;
}
