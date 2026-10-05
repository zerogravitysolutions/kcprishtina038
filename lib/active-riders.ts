import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clubTodayISO } from "@/lib/clubtime";
import { addDays } from "@/lib/kpi";

/** Days without a training after which a rider leaves the coach views. */
export const ACTIVE_WINDOW_DAYS = 90;

/** Active roster riders with at least one training in the last 90 days.
 * KPIs, Segments and Progress list only these riders. */
export async function recentlyActiveRiders(supabase: SupabaseClient): Promise<{ id: string; full_name: string; section_slug: string | null }[]> {
  const since = addDays(clubTodayISO(), -ACTIVE_WINDOW_DAYS);
  const [{ data: members, error: memberError }, { data: entries, error: entryError }] = await Promise.all([
    supabase.from("team_members").select("id, full_name, section_slug")
      .eq("status", "active").contains("positions", ["rider"]).order("full_name"),
    supabase.from("ride_entries").select("athlete_id, ride:training_rides!inner(ride_date)")
      .eq("participated", true).gte("ride.ride_date", since).limit(10_000),
  ]);
  if (memberError || entryError) throw memberError ?? entryError;
  const trained = new Set((entries ?? []).map((entry) => entry.athlete_id as string));
  return ((members ?? []) as { id: string; full_name: string; section_slug: string | null }[])
    .filter((member) => trained.has(member.id));
}
