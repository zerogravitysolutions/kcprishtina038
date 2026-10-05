import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { clubTodayISO } from "@/lib/clubtime";
import { addDays } from "@/lib/kpi";
import { derivedFtp, derivedMaxHr, FTP_WINDOW_DAYS, MAX_HR_WINDOW_DAYS, type AthleteActivity,
  type DerivedFtp, type DerivedMaxHr } from "@/lib/athlete-metrics";

export type AthleteSnapshot = {
  ftp: DerivedFtp | null;
  maxHr: DerivedMaxHr | null;
  weightKg: number | null;
  weightSource: "strava" | "profile" | null;
};

/** FTP and max HR from the riders' activities; weight from Strava, else from
 * what the rider entered on their own profile. */
export async function athleteSnapshots(athleteIds: string[], today = clubTodayISO()): Promise<Map<string, AthleteSnapshot>> {
  const result = new Map<string, AthleteSnapshot>();
  if (!athleteIds.length) return result;
  const admin = createAdminClient();
  const since = addDays(today, -Math.max(FTP_WINDOW_DAYS, MAX_HR_WINDOW_DAYS));
  const [{ data: entries, error: entryError }, { data: links, error: linkError }, { data: members, error: memberError }] = await Promise.all([
    admin.from("ride_entries")
      .select("athlete_id, participated, best_power_20m_w, max_hr, ftp_w, ride:training_rides!inner(ride_date)")
      .in("athlete_id", athleteIds).gte("ride.ride_date", since).limit(20_000),
    admin.from("strava_connections").select("athlete_id, strava_weight_kg").in("athlete_id", athleteIds),
    admin.from("team_members").select("id, profile:profiles!profile_id(metadata)").in("id", athleteIds),
  ]);
  if (entryError || linkError || memberError) throw entryError ?? linkError ?? memberError;
  const byAthlete = new Map<string, AthleteActivity[]>();
  for (const entry of (entries ?? []) as unknown as (AthleteActivity & { athlete_id: string; ride: { ride_date: string } })[]) {
    const rows = byAthlete.get(entry.athlete_id) ?? [];
    rows.push({ ...entry, ride_date: entry.ride.ride_date });
    byAthlete.set(entry.athlete_id, rows);
  }
  const stravaWeight = new Map((links ?? []).map((link) => [link.athlete_id, link.strava_weight_kg]));
  const profileWeight = new Map(((members ?? []) as unknown as { id: string; profile: { metadata: Record<string, unknown> | null } | null }[])
    .map((member) => {
      const raw = Number(String(member.profile?.metadata?.weight_kg ?? "").replace(",", "."));
      return [member.id, Number.isFinite(raw) && raw > 0 ? raw : null] as const;
    }));
  for (const id of athleteIds) {
    const rows = byAthlete.get(id) ?? [];
    const strava = stravaWeight.get(id) ?? null;
    const own = profileWeight.get(id) ?? null;
    result.set(id, {
      ftp: derivedFtp(rows, today), maxHr: derivedMaxHr(rows, today),
      weightKg: strava ?? own, weightSource: strava ? "strava" : own ? "profile" : null,
    });
  }
  return result;
}

/** Best 20-min power in the 6 weeks up to `rideDate` (that ride excluded). */
export async function best20Before(athleteId: string, rideDate: string): Promise<number | null> {
  const { data, error } = await createAdminClient().from("ride_entries")
    .select("best_power_20m_w, ride:training_rides!inner(ride_date)")
    .eq("athlete_id", athleteId).eq("participated", true).not("best_power_20m_w", "is", null)
    .gt("ride.ride_date", addDays(rideDate, -FTP_WINDOW_DAYS)).lte("ride.ride_date", rideDate)
    .order("best_power_20m_w", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0]?.best_power_20m_w ?? null;
}
