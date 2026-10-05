"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RIDE_METRIC_FIELDS, RIDE_METRIC_BY_KEY, coerceMetric } from "@/lib/training";
import { stravaActivityId, isStravaAppLink, parseStravaUrl } from "@/lib/strava";
import { parseStravaEmbed } from "@/lib/strava-embed";
import { dbError } from "@/lib/errors";
import type { TableInsert, TableUpdate } from "@/lib/supabase/types";

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

// Session-level "Bazë" fields shared by the whole group (same route).
const BASE_KEYS = ["distance_km", "moving_seconds", "elevation_m"] as const;
type BaseSrc = { distance_km?: string; moving_seconds?: string; elevation_m?: string };
// The same three columns exist on training_rides and on ride_entries, so the
// coerced values are spread into both.
type BaseValues = Pick<TableUpdate<"training_rides">, (typeof BASE_KEYS)[number]>;

async function assertCoach() {
  const p = await getProfile();
  if (!p || !COACH_ROLES.includes(p.role)) throw new Error("forbidden");
  return p;
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Strava trainings are imported automatically, so remember the activities a
// coach deletes; later Strava updates must not recreate them.
async function dismissStravaActivities(filter: { rideId: string; entryId?: string }) {
  const supabase = await createClient();
  let query = supabase.from("ride_entries").select("athlete_id, strava_activity_id")
    .eq("ride_id", filter.rideId).eq("strava_imported", true).not("strava_activity_id", "is", null);
  if (filter.entryId) query = query.eq("id", filter.entryId);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return;
  const { error: dismissError } = await createAdminClient().from("strava_dismissed_activities").upsert(
    data.map((entry) => ({ athlete_id: entry.athlete_id, strava_activity_id: entry.strava_activity_id! })),
    { onConflict: "athlete_id,strava_activity_id", ignoreDuplicates: true });
  if (dismissError) throw dismissError;
}

// Coerce the three base fields (raw strings; moving_seconds already in seconds)
// into DB values, reusing the shared metric field definitions.
function coerceBase(src: BaseSrc): { ok: true; base: BaseValues } | { ok: false; error: string } {
  const base: BaseValues = {};
  for (const key of BASE_KEYS) {
    const raw = src[key];
    if (raw === undefined) continue;
    const r = coerceMetric(RIDE_METRIC_BY_KEY[key], raw);
    if (!r.ok) return { ok: false, error: r.error };
    base[key] = r.value as number | null;
  }
  return { ok: true, base };
}

// ------------------------------------------------------------------ rides

export type CreateRideInput = {
  ride_date: string;
  title?: string;
  focus?: string;
  section_id?: string | null;
  strava_url?: string;
  athlete_ids: string[];
} & BaseSrc;

export async function createRide(input: CreateRideInput): Promise<Result<{ id: string }>> {
  try {
    const me = await assertCoach();
    const supabase = await createClient();

    if (!input.ride_date) return { ok: false, error: "Data mungon." };
    if (!input.focus?.trim()) return { ok: false, error: "Lloji i ushtrimit është i detyrueshëm." };
    const athletes = Array.from(new Set((input.athlete_ids ?? []).filter(Boolean)));
    if (athletes.length === 0) return { ok: false, error: "Zgjidh së paku një çiklist." };

    const baseR = coerceBase(input);
    if (!baseR.ok) return baseR;
    const base = baseR.base;

    let stravaUrl = input.strava_url?.trim() || null;
    if (stravaUrl && isStravaAppLink(stravaUrl)) {
      const resolved = await resolveActivity(stravaUrl);
      if (!resolved) return { ok: false, error: "S’u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };
      stravaUrl = resolved.url;
    }
    const stravaAid = stravaUrl ? stravaActivityId(stravaUrl) : null;

    const { data: ride, error: rideErr } = await supabase
      .from("training_rides")
      .insert({
        ride_date: input.ride_date,
        title: input.title?.trim().slice(0, 120) || null,
        focus: input.focus?.trim() || null,
        section_id: input.section_id || null,
        strava_url: stravaUrl,
        strava_activity_id: stravaAid ? Number(stravaAid) : null,
        created_by: me.id,
        ...base,
      })
      .select("id")
      .single<{ id: string }>();
    if (rideErr || !ride) return { ok: false, error: dbError(rideErr, "Stërvitja nuk u krijua.") };

    // Inherit the session base into every rider's entry (still editable).
    const entryBase: BaseValues = {};
    if (base.distance_km != null) entryBase.distance_km = base.distance_km;
    if (base.moving_seconds != null) entryBase.moving_seconds = base.moving_seconds;
    if (base.elevation_m != null) entryBase.elevation_m = base.elevation_m;
    const rows: TableInsert<"ride_entries">[] =
      athletes.map((athlete_id) => ({ ride_id: ride.id, athlete_id, ...entryBase }));
    const { error: entErr } = await supabase.from("ride_entries").insert(rows);
    if (entErr) {
      // Roll back the empty ride so we don't leave an orphan.
      await supabase.from("training_rides").delete().eq("id", ride.id);
      return { ok: false, error: dbError(entErr, "Çiklistët nuk u shtuan në stërvitje.") };
    }

    revalidatePath("/admin/training");
    return { ok: true, id: ride.id };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export type RidePatch = {
  ride_date?: string;
  title?: string;
  focus?: string;
  section_id?: string | null;
  strava_url?: string;
};

export async function updateRide(id: string, patch: RidePatch): Promise<Result> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const update: TableUpdate<"training_rides"> = {};
    if (patch.ride_date !== undefined) {
      if (!patch.ride_date) return { ok: false, error: "Data mungon." };
      update.ride_date = patch.ride_date;
    }
    if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || null;
    if (patch.focus !== undefined) update.focus = patch.focus.trim() || null;
    if (patch.section_id !== undefined) update.section_id = patch.section_id || null;
    if (patch.strava_url !== undefined) {
      let u = patch.strava_url.trim();
      if (u && isStravaAppLink(u)) {
        const resolved = await resolveActivity(u);
        if (!resolved) return { ok: false, error: "S’u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };
        u = resolved.url;
      }
      update.strava_url = u || null;
      const aid = u ? stravaActivityId(u) : null;
      update.strava_activity_id = aid ? Number(aid) : null;
    }
    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await supabase.from("training_rides").update(update).eq("id", id);
    if (error) return { ok: false, error: dbError(error, "Ruajtja e stërvitjes dështoi. Provo sërish.") };
    revalidatePath(`/admin/training/${id}`);
    revalidatePath("/admin/training");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function deleteRide(id: string): Promise<Result> {
  try {
    await assertCoach();
    await dismissStravaActivities({ rideId: id });
    const supabase = await createClient();
    const { error } = await supabase.from("training_rides").delete().eq("id", id);
    if (error) return { ok: false, error: dbError(error, "Fshirja e stërvitjes dështoi. Provo sërish.") };
    revalidatePath("/admin/training");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

// ------------------------------------------------------------------ entries

export async function addEntry(rideId: string, athleteId: string): Promise<Result<{ id: string }>> {
  try {
    await assertCoach();
    if (!athleteId) return { ok: false, error: "Zgjidh një çiklist." };
    const supabase = await createClient();
    // Inherit the ride's session base (distance / duration / elevation).
    const { data: ride } = await supabase
      .from("training_rides")
      .select("distance_km, moving_seconds, elevation_m")
      .eq("id", rideId)
      .maybeSingle<{ distance_km: number | null; moving_seconds: number | null; elevation_m: number | null }>();
    const insertRow: TableInsert<"ride_entries"> = { ride_id: rideId, athlete_id: athleteId };
    if (ride?.distance_km != null) insertRow.distance_km = ride.distance_km;
    if (ride?.moving_seconds != null) insertRow.moving_seconds = ride.moving_seconds;
    if (ride?.elevation_m != null) insertRow.elevation_m = ride.elevation_m;
    const { data, error } = await supabase
      .from("ride_entries")
      .insert(insertRow)
      .select("id")
      .single<{ id: string }>();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ky çiklist është tashmë në këtë stërvitje." };
      return { ok: false, error: dbError(error, "Shtimi i çiklistit dështoi. Provo sërish.") };
    }
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function removeEntry(rideId: string, entryId: string): Promise<Result> {
  try {
    await assertCoach();
    await dismissStravaActivities({ rideId, entryId });
    const supabase = await createClient();
    const { error } = await supabase
      .from("ride_entries")
      .delete()
      .eq("id", entryId)
      .eq("ride_id", rideId);
    if (error) return { ok: false, error: dbError(error, "Heqja e çiklistit dështoi. Provo sërish.") };
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export type EntryPatch = {
  participated?: boolean;
  strava_url?: string;
  metrics?: Record<string, string>; // field key -> raw string (duration already in seconds)
};

export async function updateEntry(
  rideId: string,
  entryId: string,
  patch: EntryPatch,
): Promise<Result> {
  try {
    const me = await assertCoach();
    const supabase = await createClient();
    const update: TableUpdate<"ride_entries"> = {};

    if (patch.participated !== undefined) update.participated = !!patch.participated;
    if (patch.strava_url !== undefined) {
      const u = patch.strava_url.trim();
      update.strava_url = u || null;
      const aid = u ? stravaActivityId(u) : null;
      update.strava_activity_id = aid ? Number(aid) : null;
    }
    if (patch.metrics) {
      for (const f of RIDE_METRIC_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(patch.metrics, f.key)) {
          const r = coerceMetric(f, patch.metrics[f.key]);
          if (!r.ok) return { ok: false, error: r.error };
          // coerceMetric's union carries `string` for kind:"text" fields. Every
          // RideMetricKey is a NUMERIC ride_entries column, so that branch
          // cannot reach this assignment — the cast only drops the dead arm.
          update[f.key] = r.value as number | null;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from("ride_entries")
        .update(update)
        .eq("id", entryId)
        .eq("ride_id", rideId);
      if (error) return { ok: false, error: dbError(error, "Ruajtja e të dhënave dështoi. Provo sërish.") };
    }

    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function refreshStravaEntry(rideId: string, entryId: string): Promise<Result<{ metrics: Record<string, number | null> }>> {
  try {
    await assertCoach();
    const { refreshImportedStravaEntry } = await import("@/lib/strava-sync");
    const entry = await refreshImportedStravaEntry(rideId, entryId);
    const metrics = Object.fromEntries(RIDE_METRIC_FIELDS.map((field) => [field.key, entry[field.key]]));
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true, metrics };
  } catch (e) {
    return { ok: false, error: dbError(e, "Rifreskimi nga Strava dështoi.") };
  }
}

// ------------------------------------------------------------------ profiles

/** FTP, max HR and weight come from the rider's activities and Strava; the
 * coach only keeps notes here. */
export async function saveAthleteNotes(athleteId: string, notes: string): Promise<Result> {
  try {
    const me = await assertCoach();
    const supabase = await createClient();
    const { error } = await supabase.from("athlete_profiles").upsert(
      { athlete_id: athleteId, notes: notes.trim() || null, updated_by: me.id },
      { onConflict: "athlete_id" });
    if (error) return { ok: false, error: dbError(error, "Ruajtja e shënimeve dështoi. Provo sërish.") };
    revalidatePath(`/admin/athletes/${athleteId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

// ------------------------------------------------------------------ strava

/**
 * Resolve a pasted link to a canonical activity URL + id. Handles both
 * strava.com/activities/<id> and strava.app.link/<code> deep links (followed
 * server-side, host-validated to avoid SSRF). Returns null if not an activity.
 */
async function resolveActivity(raw: string): Promise<{ url: string; activityId: string } | null> {
  const direct = parseStravaUrl(raw);
  if (direct?.type === "activity") return { url: `https://www.strava.com/activities/${direct.id}`, activityId: direct.id };

  // Deep link: validate the HOST before fetching (isStravaAppLink parses it).
  let target: URL | null = null;
  try { target = new URL(raw); } catch { target = null; }
  if (target && isStravaAppLink(target.toString())) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(target.toString(), { redirect: "follow", signal: controller.signal });
      const p = parseStravaUrl(res.url || raw);
      if (p?.type === "activity") return { url: `https://www.strava.com/activities/${p.id}`, activityId: p.id };
      const body = await res.text();
      const m = body.match(/strava\.com\\?\/activities\\?\/(\d+)/i);
      if (m) return { url: `https://www.strava.com/activities/${m[1]}`, activityId: m[1] };
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

export async function resolveStravaUrl(
  url: string,
): Promise<{ ok: true; url: string; activityId: string } | { ok: false; error: string }> {
  try {
    await assertCoach();
    const raw = (url ?? "").trim();
    if (!raw) return { ok: false, error: "Lidhja mungon." };
    const r = await resolveActivity(raw);
    if (r) return { ok: true, url: r.url, activityId: r.activityId };
    return { ok: false, error: "S’u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };
  } catch (e) {
    return { ok: false, error: dbError(e, "Lidhja me Strava-n dështoi. Provo sërish.") };
  }
}

/** Fill the shared training fields when Strava publishes an activity embed. */
export async function fetchStravaStats(url: string): Promise<
  | { ok: true; url: string; activityId: string; distance_km: number | null; elevation_m: number | null; moving_seconds: number | null; warning?: string }
  | { ok: false; error: string }
> {
  try {
    await assertCoach();
    const resolved = await resolveActivity((url ?? "").trim());
    if (!resolved) return { ok: false, error: "S’u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };

    const withoutStats = {
      ok: true as const, ...resolved,
      distance_km: null, elevation_m: null, moving_seconds: null,
      warning: "Lidhja u njoh, por Strava nuk dha statistika në pamjen e përbashkët. Plotëso Bazën me dorë.",
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://strava-embeds.com/activity/${resolved.activityId}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return withoutStats;
      const stats = parseStravaEmbed(await response.text());
      if (Object.values(stats).every((value) => value == null)) return withoutStats;
      const incomplete = Object.values(stats).some((value) => value == null);
      return {
        ok: true, ...resolved, ...stats,
        ...(incomplete ? { warning: "U plotësuan statistikat e disponueshme. Plotëso fushat e tjera nga Strava." } : {}),
      };
    } catch {
      return withoutStats;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return { ok: false, error: dbError(error, "Lidhja me Strava-n dështoi. Provo sërish.") };
  }
}
