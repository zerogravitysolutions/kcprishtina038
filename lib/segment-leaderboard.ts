import type { TableRow } from "@/lib/supabase/types";

export const TRACKED_SEGMENTS = [
  { id: 11076508, name: "Stallova Climb", distanceKm: 2.504, grade: 7.4 },
  { id: 20387178, name: "Butovc Climb", distanceKm: 3.302, grade: 10.6 },
  { id: 12854147, name: "Back of Stallova", distanceKm: 6.463, grade: 3.8 },
  { id: 37193368, name: "Germia Suffer Test", distanceKm: 3.798, grade: 8.4 },
  { id: 12767492, name: "Siqeva Climb", distanceKm: 1.791, grade: 5.7 },
  { id: 11961979, name: "Graštica - Kolic", distanceKm: 5.181, grade: 6.4 },
  { id: 12661866, name: "Prison Wall", distanceKm: 1.118, grade: 10.8 },
] as const;

export type SegmentEffort = TableRow<"strava_segment_efforts">;
export type SegmentStats = TableRow<"strava_segment_stats">;
export type SegmentRider = { id: string; name: string };
export type SegmentResult = {
  activityId: number;
  elapsedSeconds: number;
  date: string;
  avgPowerW: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
};
export type SegmentLeaderboardRow = SegmentRider & {
  rank: number | null;
  connected: boolean;
  pb: SegmentResult | null;
  pbVerified: boolean;
  latest: SegmentResult | null;
  latestIsPb: boolean;
};

function resultFromEffort(effort: SegmentEffort): SegmentResult {
  return {
    activityId: effort.strava_activity_id,
    elapsedSeconds: effort.elapsed_seconds,
    date: effort.local_date,
    avgPowerW: effort.avg_power_w,
    avgHr: effort.avg_hr,
    maxHr: effort.max_hr,
    avgCadence: effort.avg_cadence,
  };
}

/** Ranking uses elapsed segment time, the same quantity Strava uses for PRs.
 * A Strava all-time PR summary takes precedence over an incomplete local scan. */
export function buildSegmentLeaderboard(
  riders: SegmentRider[], connectedIds: Set<string>, efforts: SegmentEffort[],
  stats: SegmentStats[], segmentId: number,
): SegmentLeaderboardRow[] {
  const ownEfforts = new Map<string, SegmentEffort[]>();
  for (const effort of efforts) {
    if (effort.segment_id !== segmentId || !connectedIds.has(effort.athlete_id)) continue;
    if (!ownEfforts.has(effort.athlete_id)) ownEfforts.set(effort.athlete_id, []);
    ownEfforts.get(effort.athlete_id)!.push(effort);
  }
  const ownStats = new Map(stats.filter((s) => s.segment_id === segmentId).map((s) => [s.athlete_id, s]));
  const rows = riders.map((rider): SegmentLeaderboardRow => {
    const connected = connectedIds.has(rider.id);
    const own = connected ? ownEfforts.get(rider.id) ?? [] : [];
    const stat = connected ? ownStats.get(rider.id) : undefined;
    const localBest = own.slice().sort((a, b) => a.elapsed_seconds - b.elapsed_seconds ||
      a.started_at.localeCompare(b.started_at))[0];
    const localLatest = own.slice().sort((a, b) => b.started_at.localeCompare(a.started_at) ||
      b.strava_activity_id - a.strava_activity_id)[0];
    let pb = localBest ? resultFromEffort(localBest) : null;
    let pbVerified = !!(pb && stat?.pr_elapsed_seconds && pb.elapsedSeconds < stat.pr_elapsed_seconds);
    if (stat?.pr_elapsed_seconds && stat.pr_activity_id && stat.pr_date &&
        (!pb || stat.pr_elapsed_seconds <= pb.elapsedSeconds)) {
      const matching = own.find((e) => e.strava_activity_id === stat.pr_activity_id &&
        e.elapsed_seconds === stat.pr_elapsed_seconds);
      pb = matching ? resultFromEffort(matching) : {
        activityId: stat.pr_activity_id, elapsedSeconds: stat.pr_elapsed_seconds,
        date: stat.pr_date, avgPowerW: null, avgHr: null, maxHr: null, avgCadence: null,
      };
      pbVerified = true;
    }
    const latest = localLatest ? resultFromEffort(localLatest) : null;
    return {
      ...rider, rank: null, connected,
      pb, pbVerified, latest,
      latestIsPb: !!(pbVerified && latest && pb && latest.activityId === pb.activityId &&
        latest.elapsedSeconds === pb.elapsedSeconds),
    };
  });
  rows.sort((a, b) => (a.pb?.elapsedSeconds ?? Infinity) - (b.pb?.elapsedSeconds ?? Infinity) ||
    a.name.localeCompare(b.name, "sq"));
  let lastTime: number | null = null;
  let rank = 0;
  rows.forEach((row, index) => {
    if (!row.pb) return;
    if (row.pb.elapsedSeconds !== lastTime) rank = index + 1;
    row.rank = rank;
    lastTime = row.pb.elapsedSeconds;
  });
  return rows;
}
