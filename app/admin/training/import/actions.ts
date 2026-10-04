"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaAthlete, type StravaConnection } from "@/lib/strava-api";
import { cyclingMode } from "@/lib/strava-cycling";
import { groupMatchingIndoorRides, groupMatchingRides, matchIndoorRides, matchRides, type LatLng, type MatchRide } from "@/lib/strava-match";
import { metricsFromStrava, type ImportedMetrics, type PowerStreams } from "@/lib/strava-metrics";
import { median, suggestedFocus, suggestedTitle } from "@/lib/strava-suggestions";
import { TRAINING_FOCUS, RIDE_METRIC_FIELDS, coerceMetric, computeIntensity, computeTss, parseDurationToSeconds } from "@/lib/training";
import { dbError } from "@/lib/errors";
import type { TableInsert } from "@/lib/supabase/types";

const COACH_ROLES = new Set(["admin", "editor", "staff", "coach"]);
const WEEK_SECONDS = 7 * 24 * 60 * 60;

type StreamSet = PowerStreams & { latlng?: { data?: LatLng[] } };
type ConnectedRider = { id: string; full_name: string; section_slug: string | null };
type PreparedRide = { rider: ConnectedRider; connection: StravaConnection; activity: StravaActivity; match: MatchRide };

export type ImportSuggestion = {
  key: string;
  mode: "indoor" | "outdoor";
  title: string;
  rideDate: string;
  focus: string;
  sectionId: string | null;
  matchPercent: number;
  base: { distanceKm: number; movingSeconds: number; elevationM: number };
  riders: {
    athleteId: string; activityId: string; name: string; activityName: string;
    metrics: ImportedMetrics; referenceFtp: number | null;
  }[];
};

async function assertCoach() {
  const profile = await getProfile();
  if (!profile || !COACH_ROLES.has(profile.role)) throw new Error("Nuk ke qasje në importin e stërvitjeve.");
  return profile;
}

async function connectedRiders() {
  const admin = createAdminClient();
  const [{ data: connections, error: connectionError }, { data: riders, error: riderError }] = await Promise.all([
    admin.from("strava_connections").select("*"),
    admin.from("team_members").select("id, full_name, section_slug").contains("positions", ["rider"]).eq("status", "active"),
  ]);
  if (connectionError || riderError) throw connectionError ?? riderError;
  const byId = new Map(((riders ?? []) as ConnectedRider[]).map((rider) => [rider.id, rider]));
  return ((connections ?? []) as StravaConnection[])
    .map((connection) => ({ connection, rider: byId.get(connection.athlete_id) }))
    .filter((value): value is { connection: StravaConnection; rider: ConnectedRider } => !!value.rider);
}

async function activityRoute(connection: StravaConnection, activityId: string): Promise<LatLng[]> {
  const streams = await stravaGet<StreamSet>(connection,
    `/activities/${encodeURIComponent(activityId)}/streams?keys=latlng&key_by_type=true`);
  return (streams.latlng?.data ?? []).filter((p): p is LatLng =>
    Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

async function activityMetrics(connection: StravaConnection, activity: StravaActivity, fallbackFtp: number | null,
  athleteProfile?: Promise<StravaAthlete | null>): Promise<ImportedMetrics> {
  const hasProfileScope = connection.scopes.split(/[\s,]+/).includes("profile:read_all");
  const [streams, athlete] = await Promise.all([
    stravaGet<PowerStreams>(connection, `/activities/${activity.id}/streams?keys=time,watts&key_by_type=true`)
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "Strava API: 404") return {} as PowerStreams;
        throw error;
      }),
    athleteProfile ?? (hasProfileScope ? stravaGet<StravaAthlete>(connection, "/athlete") : Promise.resolve(null)),
  ]);
  return metricsFromStrava(activity, streams, athlete?.id === connection.strava_athlete_id ? athlete.ftp : null, fallbackFtp);
}

async function profileFtps(athleteIds: string[]): Promise<Map<string, number | null>> {
  if (!athleteIds.length) return new Map();
  const { data, error } = await createAdminClient().from("athlete_profiles")
    .select("athlete_id, ftp_w").in("athlete_id", athleteIds);
  if (error) throw error;
  return new Map((data ?? []).map((item) => [item.athlete_id, item.ftp_w]));
}

function asMatch(athleteId: string, activity: StravaActivity, route: LatLng[]): MatchRide {
  return {
    athleteId, activityId: String(activity.id), startMs: Date.parse(activity.start_date),
    elapsedSeconds: activity.elapsed_time, distanceMeters: activity.distance,
    elevationMeters: activity.total_elevation_gain, route,
  };
}

export async function findStravaGroups(): Promise<
  { ok: true; suggestions: ImportSuggestion[]; connectedCount: number } | { ok: false; error: string }
> {
  try {
    await assertCoach();
    const connected = await connectedRiders();
    if (connected.length < 2) return { ok: true, suggestions: [], connectedCount: connected.length };
    const after = Math.floor(Date.now() / 1000) - WEEK_SECONDS;
    const listed = (await Promise.all(connected.map(async ({ rider, connection }) => {
      const activities = await stravaGet<StravaActivity[]>(connection,
        `/athlete/activities?after=${after}&per_page=100`);
      return activities
        .filter((activity) => {
          const mode = cyclingMode(activity);
          return mode !== null && activity.elapsed_time > 0 && (mode === "indoor" || activity.distance > 2_000);
        })
        .map((activity) => ({ rider, connection, activity }));
    }))).flat();

    // Indoor candidates are checked by start time and duration. GPS streams
    // are fetched only for outdoor candidates that pass the cheap checks.
    const candidates = listed.filter((item) => listed.some((other) =>
      item.rider.id !== other.rider.id &&
      cyclingMode(item.activity) === cyclingMode(other.activity) &&
      (cyclingMode(item.activity) === "indoor"
        ? matchIndoorRides(asMatch(item.rider.id, item.activity, []), asMatch(other.rider.id, other.activity, [])) !== null
        : Math.abs(Date.parse(item.activity.start_date) - Date.parse(other.activity.start_date)) <= 30 * 60_000 &&
          Math.abs(item.activity.total_elevation_gain - other.activity.total_elevation_gain) <=
            Math.max(150, 0.2 * Math.max(item.activity.total_elevation_gain, other.activity.total_elevation_gain)))));
    const prepared: PreparedRide[] = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const batch = await Promise.allSettled(candidates.slice(i, i + 4).map(async (item) => {
        const mode = cyclingMode(item.activity);
        const route = mode === "outdoor" ? await activityRoute(item.connection, String(item.activity.id)) : [];
        return mode === "indoor" || route.length > 1
          ? { ...item, match: asMatch(item.rider.id, item.activity, route) } : null;
      }));
      for (const result of batch) {
        if (result.status === "fulfilled" && result.value) prepared.push(result.value);
        if (result.status === "rejected" && result.reason instanceof Error && result.reason.message.includes("kufiri")) throw result.reason;
      }
    }

    const admin = createAdminClient();
    const ids = prepared.map((item) => Number(item.match.activityId));
    const { data: existing, error: existingError } = ids.length
      ? await admin.from("ride_entries").select("athlete_id, strava_activity_id").in("strava_activity_id", ids)
      : { data: [] as { athlete_id: string; strava_activity_id: number | null }[], error: null };
    if (existingError) throw existingError;
    const { data: rejected, error: rejectedError } = ids.length
      ? await admin.from("strava_review_rejections")
        .select("athlete_id, strava_activity_id").in("strava_activity_id", ids)
      : { data: [] as { athlete_id: string; strava_activity_id: number }[], error: null };
    if (rejectedError) throw rejectedError;
    const imported = new Set([...(existing ?? []), ...(rejected ?? [])]
      .map((entry) => `${entry.athlete_id}:${entry.strava_activity_id}`));
    const available = prepared.filter((item) => !imported.has(`${item.match.athleteId}:${item.match.activityId}`));
    const byActivity = new Map(available.map((item) => [item.match.activityId, item]));
    const groups: { rides: MatchRide[]; mode: "indoor" | "outdoor"; score: number }[] = [
      ...groupMatchingRides(available.filter((item) => cyclingMode(item.activity) === "outdoor")
        .map((item) => item.match)).map((group) => ({ rides: group.rides, mode: "outdoor" as const, score: group.minimumRouteOverlap })),
      ...groupMatchingIndoorRides(available.filter((item) => cyclingMode(item.activity) === "indoor")
        .map((item) => item.match)).map((group) => ({ rides: group.rides, mode: "indoor" as const, score: group.minimumTimeMatch })),
    ];
    const groupItems = groups.flatMap((group) => group.rides.map((ride) => byActivity.get(ride.activityId)!));
    const fallbackFtps = await profileFtps(groupItems.map((item) => item.rider.id));
    const full = new Map<string, { activity: StravaActivity; metrics: ImportedMetrics }>();
    const athleteProfiles = new Map<string, Promise<StravaAthlete | null>>();
    for (let i = 0; i < groupItems.length; i += 4) {
      const batch = await Promise.all(groupItems.slice(i, i + 4).map(async (item) => {
        const activity = await stravaGet<StravaActivity>(item.connection, `/activities/${item.activity.id}`);
        if (!athleteProfiles.has(item.rider.id)) {
          athleteProfiles.set(item.rider.id,
            item.connection.scopes.split(/[\s,]+/).includes("profile:read_all")
              ? stravaGet<StravaAthlete>(item.connection, "/athlete") : Promise.resolve(null));
        }
        const metrics = await activityMetrics(item.connection, activity,
          fallbackFtps.get(item.rider.id) ?? null, athleteProfiles.get(item.rider.id));
        return { id: String(activity.id), activity, metrics };
      }));
      for (const item of batch) full.set(item.id, item);
    }
    const { data: sections } = await admin.from("sections").select("id, slug").eq("active", true);
    const sectionBySlug = new Map((sections ?? []).map((section) => [section.slug, section.id]));

    const suggestions: ImportSuggestion[] = groups.map((group) => {
        const items = group.rides.map((ride) => byActivity.get(ride.activityId)!);
        const detailed = items.map((item) => full.get(String(item.activity.id))!);
        const sectionSlugs = [...new Set(items.map((item) => item.rider.section_slug))];
        const rideDate = items[0].activity.start_date_local.slice(0, 10);
        return {
          key: group.rides.map((ride) => ride.activityId).sort().join("-"),
          mode: group.mode,
          title: suggestedTitle(detailed.map((item) => item.activity), rideDate, group.mode === "indoor"),
          rideDate, focus: suggestedFocus(detailed.map((item) => item.activity), group.mode === "indoor"),
          sectionId: sectionSlugs.length === 1 ? sectionBySlug.get(sectionSlugs[0] ?? "") ?? null : null,
          matchPercent: Math.round(group.score * 100),
          base: {
            distanceKm: Math.round(median(detailed.map((item) => item.metrics.distance_km ?? 0)) * 100) / 100,
            movingSeconds: median(detailed.map((item) => item.metrics.moving_seconds ?? 0)),
            elevationM: median(detailed.map((item) => item.metrics.elevation_m ?? 0)),
          },
          riders: items.map((item) => ({
            athleteId: item.rider.id, activityId: String(item.activity.id), name: item.rider.full_name,
            activityName: full.get(String(item.activity.id))!.activity.name,
            metrics: full.get(String(item.activity.id))!.metrics,
            referenceFtp: fallbackFtps.get(item.rider.id) ?? null,
          })),
        };
      });
    return { ok: true, suggestions, connectedCount: connected.length };
  } catch (error) {
    return { ok: false, error: dbError(error, "Kërkimi i stërvitjeve në Strava dështoi.") };
  }
}

export async function importStravaGroup(input: {
  riders: { athleteId: string; activityId: string; metrics: Record<string, string>; setFtp: boolean }[];
  title: string; focus: string; sectionId: string | null; rideDate: string;
  base: { distance_km: string; moving_seconds: string; elevation_m: string };
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const coach = await assertCoach();
    if (input.riders.length < 2 || new Set(input.riders.map((r) => r.athleteId)).size !== input.riders.length) {
      return { ok: false, error: "Zgjidh dy ose më shumë çiklistë të ndryshëm." };
    }
    if (!TRAINING_FOCUS.some((item) => item.value === input.focus)) return { ok: false, error: "Lloji i stërvitjes është i pavlefshëm." };
    if (input.title.trim().length > 120) return { ok: false, error: "Titulli është tepër i gjatë." };
    const parsedDate = new Date(`${input.rideDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.rideDate) ||
        !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.rideDate) {
      return { ok: false, error: "Data është e pavlefshme." };
    }
    const base: { distance_km: number | null; moving_seconds: number | null; elevation_m: number | null } = {
      distance_km: null, moving_seconds: null, elevation_m: null,
    };
    for (const key of ["distance_km", "moving_seconds", "elevation_m"] as const) {
      const raw = input.base?.[key];
      if (typeof raw !== "string") return { ok: false, error: "Baza e stërvitjes është e pavlefshme." };
      if (key === "moving_seconds") {
        base.moving_seconds = raw.trim() ? parseDurationToSeconds(raw) : null;
        if (raw.trim() && base.moving_seconds === null) return { ok: false, error: "Kohëzgjatja është e pavlefshme." };
      } else {
        const field = RIDE_METRIC_FIELDS.find((item) => item.key === key)!;
        const parsed = coerceMetric(field, raw);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        base[key] = parsed.value as number | null;
      }
    }
    const connected = await connectedRiders();
    const byAthlete = new Map(connected.map((item) => [item.rider.id, item]));
    const fallbackFtps = await profileFtps(input.riders.map((item) => item.athleteId));
    const prepared = await Promise.all(input.riders.map(async (requested): Promise<PreparedRide> => {
      if (!/^\d+$/.test(requested.activityId)) throw new Error("Aktivitet i pavlefshëm.");
      const owner = byAthlete.get(requested.athleteId);
      if (!owner) throw new Error("Një çiklist nuk e ka lidhur më Strava-n.");
      const activity = await stravaGet<StravaActivity>(owner.connection,
        `/activities/${encodeURIComponent(requested.activityId)}`);
      if (String(activity.id) !== requested.activityId ||
          activity.athlete?.id !== owner.connection.strava_athlete_id ||
          !cyclingMode(activity) || activity.elapsed_time <= 0) {
        throw new Error("Aktiviteti nuk i përket çiklistit ose nuk është çiklizëm.");
      }
      const route = cyclingMode(activity) === "outdoor"
        ? await activityRoute(owner.connection, requested.activityId) : [];
      return { ...owner, activity, match: asMatch(owner.rider.id, activity, route) };
    }));
    const modes = new Set(prepared.map((item) => cyclingMode(item.activity)));
    if (modes.size !== 1) return { ok: false, error: "Aktivitetet indoor dhe outdoor nuk mund të grupohen së bashku." };
    const mode = cyclingMode(prepared[0].activity);
    const score = mode === "indoor" ? matchIndoorRides : matchRides;
    for (let i = 0; i < prepared.length; i++) for (let j = i + 1; j < prepared.length; j++) {
      if (score(prepared[i].match, prepared[j].match) === null) {
        return { ok: false, error: mode === "indoor"
          ? "Këto aktivitete indoor nuk e plotësojnë më përputhjen e kohës dhe kohëzgjatjes."
          : "Këto aktivitete nuk e plotësojnë më përputhjen 60% të rrugës, kohës dhe ngjitjes." };
      }
    }

    const supabase = await createClient();
    const ids = prepared.map((item) => Number(item.activity.id));
    const { data: existing, error: existingError } = await supabase.from("ride_entries")
      .select("athlete_id, strava_activity_id").in("strava_activity_id", ids);
    if (existingError) throw existingError;
    if ((existing ?? []).some((entry) => prepared.some((item) =>
      entry.athlete_id === item.rider.id && entry.strava_activity_id === item.activity.id))) {
      return { ok: false, error: "Një aktivitet është importuar më parë." };
    }
    if (input.sectionId) {
      const { data: section } = await supabase.from("sections").select("id").eq("id", input.sectionId).eq("active", true).maybeSingle();
      if (!section) return { ok: false, error: "Seksioni nuk është aktiv." };
    }
    const metricRows = await Promise.all(prepared.map(async (item, index) => {
      const metrics = await activityMetrics(item.connection, item.activity, fallbackFtps.get(item.rider.id) ?? null);
      const edits = input.riders[index].metrics;
      if (!edits || typeof edits !== "object") throw new Error("Vlerat e çiklistit janë të pavlefshme.");
      for (const field of RIDE_METRIC_FIELDS) {
        if (field.computed || !Object.prototype.hasOwnProperty.call(edits, field.key)) continue;
        const raw = edits[field.key];
        if (typeof raw !== "string") throw new Error(`${field.label}: vlerë e pavlefshme.`);
        if (field.ui === "duration") {
          metrics.moving_seconds = raw.trim() ? parseDurationToSeconds(raw) : null;
          if (raw.trim() && metrics.moving_seconds === null) throw new Error("Kohëzgjatja është e pavlefshme.");
          continue;
        }
        const parsed = coerceMetric(field, raw);
        if (!parsed.ok) throw new Error(parsed.error);
        (metrics as unknown as Record<string, number | null>)[field.key] = parsed.value as number | null;
      }
      const effectiveFtp = metrics.ftp_w ?? fallbackFtps.get(item.rider.id) ?? null;
      metrics.intensity_factor = computeIntensity(metrics.np_w, effectiveFtp);
      metrics.tss = computeTss(metrics.moving_seconds, metrics.np_w, effectiveFtp);
      return metrics;
    }));
    const { data: ride, error: rideError } = await supabase.from("training_rides").insert({
      ride_date: input.rideDate, kind: "group", review_status: "under_review",
      title: input.title.trim() || null, focus: input.focus,
      section_id: input.sectionId, created_by: coach.id,
      strava_url: `https://www.strava.com/activities/${prepared[0].activity.id}`,
      ...base,
    }).select("id").single();
    if (rideError || !ride) throw rideError ?? new Error("Stërvitja nuk u krijua.");

    const entries: TableInsert<"ride_entries">[] = prepared.map((item, index) => ({
      ride_id: ride.id, athlete_id: item.rider.id, review_status: "under_review",
      ...metricRows[index],
      set_ftp: input.riders[index].setFtp === true && metricRows[index].ftp_w !== null,
      strava_url: `https://www.strava.com/activities/${item.activity.id}`,
      strava_activity_id: item.activity.id,
      strava_imported: true,
    }));
    const { error: entriesError } = await supabase.from("ride_entries").insert(entries);
    if (entriesError) {
      await supabase.from("training_rides").delete().eq("id", ride.id);
      throw entriesError;
    }
    revalidatePath("/admin/training");
    return { ok: true, id: ride.id };
  } catch (error) {
    return { ok: false, error: dbError(error, "Importi i stërvitjes dështoi.") };
  }
}

export async function approveStravaReview(rideId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const { data: ride, error: rideError } = await supabase.from("training_rides")
      .select("id, review_status, has_pending_changes").eq("id", rideId).maybeSingle();
    if (rideError) throw rideError;
    if (!ride || (ride.review_status !== "under_review" && !ride.has_pending_changes)) {
      return { ok: false, error: "Nuk ka ndryshime për shqyrtim." };
    }
    const { data: entries, error: entriesError } = await supabase.from("ride_entries")
      .select("id, athlete_id, review_status, set_ftp, ftp_w").eq("ride_id", rideId);
    if (entriesError) throw entriesError;
    if ((entries ?? []).length < 2) {
      return { ok: false, error: "Stërvitja nuk ka mjaft çiklistë për miratim." };
    }
    if (!(entries ?? []).some((entry) => entry.review_status === "under_review")) {
      return { ok: false, error: "Nuk ka çiklistë për shqyrtim." };
    }
    const { error: approveError } = await supabase.rpc("approve_strava_review", { p_ride_id: rideId });
    if (approveError) throw approveError;
    for (const entry of entries ?? []) {
      if (entry.review_status !== "under_review" || !entry.set_ftp || entry.ftp_w == null) continue;
      revalidatePath(`/admin/athletes/${entry.athlete_id}`);
    }
    revalidatePath("/admin/training");
    revalidatePath("/admin/training/import");
    revalidatePath(`/admin/training/${rideId}`);
    revalidatePath("/portal/training");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: dbError(error, "Miratimi dështoi.") };
  }
}

export async function rejectStravaReview(rideId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertCoach();
    const supabase = await createClient();
    const { data: ride, error: rideError } = await supabase.from("training_rides")
      .select("id, review_status, has_pending_changes").eq("id", rideId).maybeSingle();
    if (rideError) throw rideError;
    if (!ride || (ride.review_status !== "under_review" && !ride.has_pending_changes)) {
      return { ok: false, error: "Nuk ka ndryshime për shqyrtim." };
    }
    const { data: rejectedEntries, error: rejectedEntriesError } = await supabase.from("ride_entries")
      .select("athlete_id, strava_activity_id, strava_imported")
      .eq("ride_id", rideId).eq("review_status", "under_review");
    if (rejectedEntriesError) throw rejectedEntriesError;
    const suppress = (rejectedEntries ?? [])
      .filter((entry) => entry.strava_imported && entry.strava_activity_id !== null)
      .map((entry) => ({ athlete_id: entry.athlete_id, strava_activity_id: entry.strava_activity_id! }));
    if (suppress.length) {
      const { error: suppressError } = await createAdminClient().from("strava_review_rejections")
        .upsert(suppress, { onConflict: "athlete_id,strava_activity_id", ignoreDuplicates: true });
      if (suppressError) throw suppressError;
    }
    if (ride.review_status === "under_review") {
      const { error } = await supabase.from("training_rides").delete().eq("id", rideId);
      if (error) throw error;
    } else {
      const { error: entriesError } = await supabase.from("ride_entries")
        .delete().eq("ride_id", rideId).eq("review_status", "under_review");
      if (entriesError) throw entriesError;
    }
    revalidatePath("/admin/training");
    revalidatePath("/admin/training/import");
    revalidatePath(`/admin/training/${rideId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: dbError(error, "Refuzimi dështoi.") };
  }
}
