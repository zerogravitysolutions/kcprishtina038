import { fortyKmSpeed } from "@/lib/strava-forty-km";
import type { TableRow } from "@/lib/supabase/types";

export type FortyKmEffort = TableRow<"strava_40km_efforts">;
export type FortyKmRow = {
  id: string;
  name: string;
  rank: number | null;
  connected: boolean;
  historyComplete: boolean;
  pb: FortyKmEffort | null;
  latest: FortyKmEffort | null;
  latestIsPb: boolean;
};

export function fortyKmKmh(effort: FortyKmEffort): number {
  return fortyKmSpeed(effort.duration_seconds);
}

export function buildFortyKmLeaderboard(
  riders: { id: string; name: string }[], connected: Set<string>,
  complete: Set<string>, efforts: FortyKmEffort[],
): FortyKmRow[] {
  const byRider = new Map<string, FortyKmEffort[]>();
  for (const effort of efforts) {
    if (!connected.has(effort.athlete_id)) continue;
    if (!byRider.has(effort.athlete_id)) byRider.set(effort.athlete_id, []);
    byRider.get(effort.athlete_id)!.push(effort);
  }
  const rows = riders.map((rider): FortyKmRow => {
    const own = byRider.get(rider.id) ?? [];
    const pb = own.slice().sort((a, b) => a.duration_seconds - b.duration_seconds)[0] ?? null;
    const latest = own.slice().sort((a, b) => b.ride_started_at.localeCompare(a.ride_started_at))[0] ?? null;
    const historyComplete = complete.has(rider.id);
    return {
      ...rider, rank: null, connected: connected.has(rider.id), historyComplete, pb, latest,
      latestIsPb: !!(historyComplete && pb && latest && pb.strava_activity_id === latest.strava_activity_id),
    };
  });
  rows.sort((a, b) => (a.pb?.duration_seconds ?? Infinity) - (b.pb?.duration_seconds ?? Infinity) ||
    a.name.localeCompare(b.name, "sq"));
  let prior: number | null = null;
  let rank = 0;
  rows.forEach((row, index) => {
    if (!row.pb) return;
    if (row.pb.duration_seconds !== prior) rank = index + 1;
    row.rank = rank;
    prior = row.pb.duration_seconds;
  });
  return rows;
}
