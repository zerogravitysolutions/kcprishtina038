"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { RIDE_METRIC_FIELDS, RIDE_METRIC_BY_KEY, coerceMetric } from "@/lib/training";
import { stravaActivityId, isStravaAppLink, parseStravaUrl } from "@/lib/strava";

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

// Session-level "Bazë" fields shared by the whole group (same route).
const BASE_KEYS = ["distance_km", "moving_seconds", "elevation_m"] as const;
type BaseSrc = { distance_km?: string; moving_seconds?: string; elevation_m?: string };

async function assertCoach() {
  const p = await getProfile();
  if (!p || !COACH_ROLES.includes(p.role)) throw new Error("forbidden");
  return p;
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Coerce the three base fields (raw strings; moving_seconds already in seconds)
// into DB values, reusing the shared metric field definitions.
function coerceBase(src: BaseSrc): { ok: true; base: Record<string, number | null> } | { ok: false; error: string } {
  const base: Record<string, number | null> = {};
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
  location?: string;
  notes?: string;
  strava_url?: string;
  athlete_ids: string[];
} & BaseSrc;

export async function createRide(input: CreateRideInput): Promise<Result<{ id: string }>> {
  try {
    const me = await assertCoach();
    const supabase = await createClient();

    if (!input.ride_date) return { ok: false, error: "Data mungon." };
    const athletes = Array.from(new Set((input.athlete_ids ?? []).filter(Boolean)));
    if (athletes.length === 0) return { ok: false, error: "Zgjidh së paku një çiklist." };

    const baseR = coerceBase(input);
    if (!baseR.ok) return baseR;
    const base = baseR.base;

    const stravaUrl = input.strava_url?.trim() || null;
    const stravaAid = stravaUrl ? stravaActivityId(stravaUrl) : null;

    const { data: ride, error: rideErr } = await supabase
      .from("training_rides")
      .insert({
        ride_date: input.ride_date,
        title: input.title?.trim() || null,
        focus: input.focus?.trim() || null,
        section_id: input.section_id || null,
        location: input.location?.trim() || null,
        notes: input.notes?.trim() || null,
        strava_url: stravaUrl,
        strava_activity_id: stravaAid ? Number(stravaAid) : null,
        created_by: me.id,
        ...base,
      } as never)
      .select("id")
      .single<{ id: string }>();
    if (rideErr || !ride) return { ok: false, error: rideErr?.message ?? "Nuk u krijua." };

    // Inherit the session base into every rider's entry (still editable).
    const entryBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(base)) if (v != null) entryBase[k] = v;
    const rows = athletes.map((athlete_id) => ({ ride_id: ride.id, athlete_id, ...entryBase }));
    const { error: entErr } = await supabase.from("ride_entries").insert(rows as never);
    if (entErr) {
      // Roll back the empty ride so we don't leave an orphan.
      await supabase.from("training_rides").delete().eq("id", ride.id);
      return { ok: false, error: entErr.message };
    }

    revalidatePath("/admin/training");
    return { ok: true, id: ride.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type RidePatch = {
  ride_date?: string;
  title?: string;
  focus?: string;
  section_id?: string | null;
  location?: string;
  notes?: string;
  strava_url?: string;
};

export async function updateRide(id: string, patch: RidePatch): Promise<Result> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const update: Record<string, unknown> = {};
    if (patch.ride_date !== undefined) {
      if (!patch.ride_date) return { ok: false, error: "Data mungon." };
      update.ride_date = patch.ride_date;
    }
    if (patch.title !== undefined) update.title = patch.title.trim() || null;
    if (patch.focus !== undefined) update.focus = patch.focus.trim() || null;
    if (patch.section_id !== undefined) update.section_id = patch.section_id || null;
    if (patch.location !== undefined) update.location = patch.location.trim() || null;
    if (patch.notes !== undefined) update.notes = patch.notes.trim() || null;
    if (patch.strava_url !== undefined) {
      const u = patch.strava_url.trim();
      update.strava_url = u || null;
      const aid = u ? stravaActivityId(u) : null;
      update.strava_activity_id = aid ? Number(aid) : null;
    }
    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await supabase.from("training_rides").update(update as never).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/training/${id}`);
    revalidatePath("/admin/training");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRide(id: string): Promise<Result> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const { error } = await supabase.from("training_rides").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/training");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
    const insertRow: Record<string, unknown> = { ride_id: rideId, athlete_id: athleteId };
    if (ride?.distance_km != null) insertRow.distance_km = ride.distance_km;
    if (ride?.moving_seconds != null) insertRow.moving_seconds = ride.moving_seconds;
    if (ride?.elevation_m != null) insertRow.elevation_m = ride.elevation_m;
    const { data, error } = await supabase
      .from("ride_entries")
      .insert(insertRow as never)
      .select("id")
      .single<{ id: string }>();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ky çiklist është tashmë në këtë stërvitje." };
      return { ok: false, error: error.message };
    }
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeEntry(rideId: string, entryId: string): Promise<Result> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const { error } = await supabase
      .from("ride_entries")
      .delete()
      .eq("id", entryId)
      .eq("ride_id", rideId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type EntryPatch = {
  participated?: boolean;
  set_ftp?: boolean;
  strava_url?: string;
  notes?: string;
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
    const update: Record<string, unknown> = {};

    if (patch.participated !== undefined) update.participated = !!patch.participated;
    if (patch.set_ftp !== undefined) update.set_ftp = !!patch.set_ftp;
    if (patch.notes !== undefined) update.notes = patch.notes.trim() || null;
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
          update[f.key] = r.value;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from("ride_entries")
        .update(update as never)
        .eq("id", entryId)
        .eq("ride_id", rideId);
      if (error) return { ok: false, error: error.message };
    }

    // If this entry is flagged as an FTP source, propagate its FTP to the
    // athlete's profile (dated to the ride). Only these two columns are
    // written, so weight / HR / notes on the profile are preserved.
    const { data: e } = await supabase
      .from("ride_entries")
      .select("athlete_id, ftp_w, set_ftp, training_rides(ride_date)")
      .eq("id", entryId)
      .maybeSingle<{ athlete_id: string; ftp_w: number | null; set_ftp: boolean; training_rides: { ride_date: string } | null }>();
    if (e?.set_ftp && e.ftp_w != null) {
      await supabase.from("athlete_profiles").upsert(
        {
          athlete_id: e.athlete_id,
          ftp_w: e.ftp_w,
          ftp_updated_at: e.training_rides?.ride_date ?? null,
          updated_by: me.id,
        } as never,
        { onConflict: "athlete_id" },
      );
      revalidatePath(`/admin/athletes/${e.athlete_id}`);
      revalidatePath("/admin/athletes");
    }

    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------ profiles

export type ProfilePatch = {
  ftp_w?: string;
  ftp_updated_at?: string;
  weight_kg?: string;
  max_hr?: string;
  resting_hr?: string;
  notes?: string;
};

function intField(raw: string | undefined, label: string, min?: number, max?: number):
  { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: null };
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return { ok: false, error: `${label}: numër i pavlefshëm.` };
  if (min != null && n < min) return { ok: false, error: `${label}: minimumi ${min}.` };
  if (max != null && n > max) return { ok: false, error: `${label}: maksimumi ${max}.` };
  return { ok: true, value: n };
}

export async function upsertAthleteProfile(athleteId: string, patch: ProfilePatch): Promise<Result> {
  try {
    const me = await assertCoach();
    const supabase = await createClient();
    const row: Record<string, unknown> = { athlete_id: athleteId, updated_by: me.id };

    const ftp = intField(patch.ftp_w, "FTP", 0);
    if (!ftp.ok) return ftp;
    row.ftp_w = ftp.value;

    const maxHr = intField(patch.max_hr, "HR maksimal", 20, 260);
    if (!maxHr.ok) return maxHr;
    row.max_hr = maxHr.value;

    const restHr = intField(patch.resting_hr, "HR në qetësi", 20, 200);
    if (!restHr.ok) return restHr;
    row.resting_hr = restHr.value;

    if (patch.weight_kg !== undefined) {
      const w = patch.weight_kg.trim();
      if (w === "") row.weight_kg = null;
      else {
        const n = parseFloat(w);
        if (Number.isNaN(n) || n < 0) return { ok: false, error: "Pesha: numër i pavlefshëm." };
        row.weight_kg = n;
      }
    }
    if (patch.ftp_updated_at !== undefined) row.ftp_updated_at = patch.ftp_updated_at.trim() || null;
    if (patch.notes !== undefined) row.notes = patch.notes.trim() || null;

    const { error } = await supabase
      .from("athlete_profiles")
      .upsert(row as never, { onConflict: "athlete_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/athletes/${athleteId}`);
    revalidatePath("/admin/athletes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  if (direct?.type === "activity") return { url: raw, activityId: direct.id };

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
    return { ok: false, error: "S'u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Parse the public Strava embed widget (no OAuth needed for public rides).
function parseWidgetTime(s: string): number | null {
  const v = s.trim();
  if (v.includes(":")) {
    const parts = v.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return null;
    let sec = 0;
    for (const p of parts) sec = sec * 60 + p;
    return sec;
  }
  let total = 0, matched = false;
  const h = v.match(/(\d+)\s*h/i); if (h) { total += parseInt(h[1], 10) * 3600; matched = true; }
  const m = v.match(/(\d+)\s*m(?!i)/i); if (m) { total += parseInt(m[1], 10) * 60; matched = true; }
  const s2 = v.match(/(\d+)\s*s/i); if (s2) { total += parseInt(s2[1], 10); matched = true; }
  return matched ? total : null;
}

function parseStravaWidget(rawHtml: string): { distance_km: number | null; elevation_m: number | null; moving_seconds: number | null } {
  const text = rawHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  let distance_km: number | null = null;
  let m = text.match(/Distance\s+([\d.,]+)\s*(km|mi)/i);
  if (m) { const v = parseFloat(m[1].replace(/,/g, "")); if (!Number.isNaN(v)) distance_km = m[2].toLowerCase() === "mi" ? Math.round(v * 1.60934 * 10) / 10 : v; }

  let elevation_m: number | null = null;
  m = text.match(/Elev(?:ation)?\s*(?:Gain)?\s+([\d.,]+)\s*(m|ft)\b/i);
  if (m) { const v = parseFloat(m[1].replace(/,/g, "")); if (!Number.isNaN(v)) elevation_m = m[2].toLowerCase() === "ft" ? Math.round(v * 0.3048) : Math.round(v); }

  let moving_seconds: number | null = null;
  m = text.match(/(?:Moving Time|Time)\s+((?:\d+\s*h\s*)?(?:\d+\s*m\s*)?(?:\d+\s*s)?|\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (m) moving_seconds = parseWidgetTime(m[1]);

  return { distance_km, elevation_m, moving_seconds };
}

/**
 * Auto-fill distance / elevation / time from a Strava link by reading Strava's
 * own public embed widget. No OAuth / API key — works for public activities;
 * private ones expose no stats and return an error so the coach fills manually.
 */
export async function fetchStravaStats(url: string): Promise<
  | { ok: true; url: string; activityId: string; distance_km: number | null; elevation_m: number | null; moving_seconds: number | null }
  | { ok: false; error: string }
> {
  try {
    await assertCoach();
    const raw = (url ?? "").trim();
    if (!raw) return { ok: false, error: "Lidhja mungon." };
    const resolved = await resolveActivity(raw);
    if (!resolved) return { ok: false, error: "S'u gjet aktiviteti — ngjit lidhjen e plotë strava.com/activities/…" };

    // Fixed host + numeric id → no SSRF surface.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    let html = "";
    try {
      const res = await fetch(`https://strava-embeds.com/activity/${resolved.activityId}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KCPrishtina/1.0)" },
      });
      if (!res.ok) return { ok: false, error: `Strava ktheu ${res.status} — a është aktiviteti publik?` };
      html = await res.text();
    } finally {
      clearTimeout(t);
    }

    const stats = parseStravaWidget(html);
    if (stats.distance_km == null && stats.elevation_m == null && stats.moving_seconds == null) {
      return { ok: false, error: "Nuk u lexuan të dhënat — ndoshta aktiviteti nuk është publik." };
    }
    return { ok: true, url: resolved.url, activityId: resolved.activityId, ...stats };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
