import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaAthlete, type StravaConnection } from "@/lib/strava-api";
import { matchIndoorRides, matchRides, type LatLng, type MatchRide } from "@/lib/strava-match";
import { cyclingMode } from "@/lib/strava-cycling";
import { metricsFromStrava, missingImportedMetrics, type PowerStreams } from "@/lib/strava-metrics";
import { median, suggestedFocus, suggestedTitle } from "@/lib/strava-suggestions";
import type { TableInsert, TableRow, TableUpdate } from "@/lib/supabase/types";

const MIN_RIDE_METERS = 2_000;
const START_WINDOW_SECONDS = 31 * 60;
type Rider = { id: string; full_name: string; section_slug: string | null };
type Connected = { rider: Rider; connection: StravaConnection };
type Matched = Connected & { activity: StravaActivity; match: MatchRide };
type Event = TableRow<"strava_activity_events">;

export async function enqueueStravaActivity(activityId: number, ownerId: number, eventTime: number,
  force = false, eventKind: "upsert" | "delete" | "revoke" = "upsert"): Promise<void> {
  const admin = createAdminClient();
  const row: TableInsert<"strava_activity_events"> = {
    activity_id: activityId, owner_id: ownerId, event_time: eventTime, event_kind: eventKind,
    ...(force ? { processed_at: null, next_attempt_at: new Date().toISOString(), claimed_until: null } : {}),
  };
  const { error } = await admin.from("strava_activity_events").upsert(row, {
    onConflict: "event_kind,activity_id", ignoreDuplicates: !force,
  });
  if (error) throw error;
}

async function connections(): Promise<Connected[]> {
  const admin = createAdminClient();
  const [{ data: links, error: linksError }, { data: riders, error: ridersError }] = await Promise.all([
    admin.from("strava_connections").select("*"),
    admin.from("team_members").select("id, full_name, section_slug")
      .contains("positions", ["rider"]).eq("status", "active"),
  ]);
  if (linksError || ridersError) throw linksError ?? ridersError;
  const byId = new Map(((riders ?? []) as Rider[]).map((rider) => [rider.id, rider]));
  return ((links ?? []) as StravaConnection[]).flatMap((connection) => {
    const rider = byId.get(connection.athlete_id);
    return rider ? [{ connection, rider }] : [];
  });
}

function asMatch(rider: Rider, activity: StravaActivity, route: LatLng[]): MatchRide {
  return {
    athleteId: rider.id, activityId: String(activity.id),
    startMs: Date.parse(activity.start_date), elapsedSeconds: activity.elapsed_time,
    distanceMeters: activity.distance, elevationMeters: activity.total_elevation_gain, route,
  };
}

async function routeFor(connection: StravaConnection, activityId: number): Promise<LatLng[]> {
  const streams = await stravaGet<{ latlng?: { data?: LatLng[] } }>(connection,
    `/activities/${activityId}/streams?keys=latlng&key_by_type=true`).catch((error: unknown) => {
      if (error instanceof Error && error.message === "Strava API: 404") return { latlng: undefined };
      throw error;
    });
  return (streams.latlng?.data ?? []).filter((point): point is LatLng =>
    Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

async function detailFor(owner: Connected, activityId: number, mode: "indoor" | "outdoor",
  cached?: StravaActivity): Promise<Matched | null> {
  let activity: StravaActivity;
  try { activity = cached ?? await stravaGet<StravaActivity>(owner.connection, `/activities/${activityId}`); }
  catch (error) {
    if (error instanceof Error && error.message === "Strava API: 404") return null;
    throw error;
  }
  if (activity.id !== activityId || activity.athlete?.id !== owner.connection.strava_athlete_id ||
      cyclingMode(activity) !== mode || activity.elapsed_time <= 0) return null;
  const route = mode === "outdoor" ? await routeFor(owner.connection, activityId) : [];
  return { ...owner, activity, match: asMatch(owner.rider, activity, route) };
}

async function promoteToGroup(ride: { id: string; ride_date: string; title: string | null; focus: string | null }) {
  const update: TableUpdate<"training_rides"> = { kind: "group" };
  if (ride.focus === "Dalje individuale") update.focus = "Dalje grupore";
  if (ride.title === `Dalje individuale · ${ride.ride_date}`) update.title = `Dalje grupore · ${ride.ride_date}`;
  const { error } = await createAdminClient().from("training_rides").update(update).eq("id", ride.id);
  if (error) throw error;
}

async function activitiesNear(owner: Connected, centerSeconds: number): Promise<StravaActivity[]> {
  const result: StravaActivity[] = [];
  // A ride uploaded later is still returned when queried by its original start
  // time. The webhook activity ID supplies that time even for an old ride.
  for (let page = 1; page <= 5; page++) {
    const rows = await stravaGet<StravaActivity[]>(owner.connection,
      `/athlete/activities?after=${centerSeconds - START_WINDOW_SECONDS}&before=${centerSeconds + START_WINDOW_SECONDS}&per_page=100&page=${page}`);
    if (!rows.length) break;
    result.push(...rows);
  }
  return result;
}

async function metricsFor(item: Matched, fallbackFtp: number | null) {
  const hasProfileScope = item.connection.scopes.split(/[\s,]+/).includes("profile:read_all");
  const [streams, athlete] = await Promise.all([
    stravaGet<PowerStreams>(item.connection,
      `/activities/${item.activity.id}/streams?keys=time,watts&key_by_type=true`)
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "Strava API: 404") return {} as PowerStreams;
        throw error;
      }),
    hasProfileScope ? stravaGet<StravaAthlete>(item.connection, "/athlete") : Promise.resolve(null),
  ]);
  return metricsFromStrava(item.activity, streams,
    athlete?.id === item.connection.strava_athlete_id ? athlete.ftp : null, fallbackFtp);
}

async function addEntries(rideId: string, items: Matched[]): Promise<void> {
  if (!items.length) return;
  const admin = createAdminClient();
  const { data: profiles, error: profilesError } = await admin.from("athlete_profiles")
    .select("athlete_id, ftp_w").in("athlete_id", items.map((item) => item.rider.id));
  if (profilesError) throw profilesError;
  const ftpById = new Map((profiles ?? []).map((profile) => [profile.athlete_id, profile.ftp_w]));
  const entries: TableInsert<"ride_entries">[] = await Promise.all(items.map(async (item) => ({
    ride_id: rideId, athlete_id: item.rider.id, review_status: "under_review" as const,
    ...await metricsFor(item, ftpById.get(item.rider.id) ?? null),
    strava_url: `https://www.strava.com/activities/${item.activity.id}`,
    strava_activity_id: item.activity.id, strava_imported: true,
  })));
  const { error } = await admin.from("ride_entries").insert(entries);
  if (error) throw error;
}

/** Fetch the latest Strava values for an imported entry and fill only empty
 * columns. A coach's saved numbers remain authoritative during review. */
async function fillMissingMetrics(entry: TableRow<"ride_entries">, item: Matched) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("athlete_profiles")
    .select("ftp_w").eq("athlete_id", entry.athlete_id).maybeSingle();
  if (profileError) throw profileError;
  const imported = await metricsFor(item, profile?.ftp_w ?? null);
  const patch = missingImportedMetrics(entry, imported, profile?.ftp_w ?? null);
  if (Object.keys(patch).length) {
    let update = admin.from("ride_entries").update(patch as TableUpdate<"ride_entries">).eq("id", entry.id)
      .eq("ride_id", entry.ride_id).eq("review_status", "under_review");
    // Prevent a refresh racing with a coach's save from replacing a new value.
    for (const key of Object.keys(patch)) update = update.is(key, null);
    const { error } = await update;
    if (error) throw error;
  }
  const { data: current, error } = await admin.from("ride_entries").select("*")
    .eq("id", entry.id).eq("ride_id", entry.ride_id).single();
  if (error || !current) throw error ?? new Error("Could not reload Strava entry");
  return current;
}

export async function refreshImportedStravaEntry(rideId: string, entryId: string) {
  const admin = createAdminClient();
  const { data: entry, error } = await admin.from("ride_entries").select("*")
    .eq("id", entryId).eq("ride_id", rideId).maybeSingle();
  if (error) throw error;
  if (!entry?.strava_imported || !entry.strava_activity_id || entry.review_status !== "under_review") {
    throw new Error("Vetëm aktivitetet Strava në shqyrtim mund të rifreskohen.");
  }
  const owner = (await connections()).find((item) => item.rider.id === entry.athlete_id);
  if (!owner) throw new Error("Lidhja e çiklistit me Strava nuk është më aktive.");
  const activity = await stravaGet<StravaActivity>(owner.connection, `/activities/${entry.strava_activity_id}`);
  if (activity.id !== entry.strava_activity_id || activity.athlete?.id !== owner.connection.strava_athlete_id ||
      !cyclingMode(activity)) throw new Error("Aktiviteti i lidhur nuk është më i disponueshëm në Strava.");
  const item: Matched = { ...owner, activity, match: asMatch(owner.rider, activity, []) };
  return fillMissingMetrics(entry, item);
}

async function processActivity(event: Event): Promise<void> {
  const all = await connections();
  const owner = all.find((item) => item.connection.strava_athlete_id === event.owner_id);
  if (!owner) return; // disconnected or no longer an active club rider
  let activity: StravaActivity;
  try { activity = await stravaGet<StravaActivity>(owner.connection, `/activities/${event.activity_id}`); }
  catch (error) {
    if (error instanceof Error && error.message === "Strava API: 404") return;
    throw error;
  }
  if (activity.id !== event.activity_id || activity.athlete?.id !== owner.connection.strava_athlete_id) return;
  const mode = cyclingMode(activity);
  if (!mode) {
    const { removeImportedStravaData } = await import("@/lib/strava-cleanup");
    await removeImportedStravaData(owner.rider.id, event.activity_id);
    return;
  }
  const target = await detailFor(owner, event.activity_id, mode, activity);
  if (!target) return;
  const admin = createAdminClient();
  const { data: targetRejection, error: targetRejectionError } = await admin.from("strava_review_rejections")
    .select("strava_activity_id").eq("athlete_id", owner.rider.id)
    .eq("strava_activity_id", event.activity_id).maybeSingle();
  if (targetRejectionError) throw targetRejectionError;
  if (targetRejection) return;
  const nearby: { item: Connected; activity: StravaActivity }[] = [];
  const center = Math.floor(target.match.startMs / 1000);
  const score = mode === "indoor" ? matchIndoorRides : matchRides;
  for (const candidateOwner of all) {
    if (candidateOwner.rider.id === owner.rider.id) continue;
    for (const activity of await activitiesNear(candidateOwner, center)) {
      if (cyclingMode(activity) === mode &&
          (mode === "indoor"
            ? score(target.match, asMatch(candidateOwner.rider, activity, [])) !== null
            : activity.distance >= MIN_RIDE_METERS &&
              Math.abs(Date.parse(activity.start_date) - target.match.startMs) <= 30 * 60_000 &&
              Math.abs(activity.total_elevation_gain - target.activity.total_elevation_gain) <=
                Math.max(150, 0.2 * Math.max(activity.total_elevation_gain, target.activity.total_elevation_gain)))) {
        nearby.push({ item: candidateOwner, activity });
      }
    }
  }
  const { data: rejected, error: rejectedError } = nearby.length
    ? await admin.from("strava_review_rejections").select("athlete_id, strava_activity_id")
      .in("strava_activity_id", nearby.map(({ activity }) => activity.id))
    : { data: [], error: null };
  if (rejectedError) throw rejectedError;
  const rejectedKeys = new Set((rejected ?? []).map((row) => `${row.athlete_id}:${row.strava_activity_id}`));
  const matched: { item: Matched; overlap: number }[] = [];
  for (const candidate of nearby) {
    if (rejectedKeys.has(`${candidate.item.rider.id}:${candidate.activity.id}`)) continue;
    const detailed = await detailFor(candidate.item, candidate.activity.id, mode);
    if (!detailed) continue;
    const overlap = score(target.match, detailed.match);
    if (overlap !== null) matched.push({ item: detailed, overlap });
  }
  matched.sort((a, b) => b.overlap - a.overlap);
  const selected = [target];
  for (const { item } of matched) {
    if (selected.some((current) => current.rider.id === item.rider.id)) continue;
    if (selected.every((current) => score(current.match, item.match) !== null)) selected.push(item);
  }
  const { data: imported, error: importedError } = await admin.from("ride_entries")
    .select("ride_id, athlete_id, strava_activity_id")
    .eq("strava_imported", true)
    .in("strava_activity_id", selected.map((item) => item.activity.id));
  if (importedError) throw importedError;
  const importedRideByActivity = new Map((imported ?? []).map((entry) => [entry.strava_activity_id, entry.ride_id]));
  const importedTarget = (imported ?? []).find((entry) => entry.strava_activity_id === target.activity.id);
  if (importedTarget) {
    const { data: existingEntry, error: existingError } = await admin.from("ride_entries").select("*")
      .eq("ride_id", importedTarget.ride_id).eq("strava_activity_id", target.activity.id).maybeSingle();
    if (existingError) throw existingError;
    if (existingEntry?.review_status === "under_review") await fillMissingMetrics(existingEntry, target);
  }
  const rideIds = [...new Set((imported ?? []).map((entry) => entry.ride_id))];

  const reusable: {
    ride: { id: string; ride_date: string; title: string | null; focus: string | null; review_status: string; created_at: string };
    members: Matched[];
  }[] = [];
  for (const rideId of rideIds) {
    const { data: ride, error: rideError } = await admin.from("training_rides")
      .select("id, ride_date, title, focus, review_status, created_at").eq("id", rideId).maybeSingle();
    if (rideError) throw rideError;
    if (!ride) continue;
    const { data: existing, error } = await admin.from("ride_entries")
      .select("athlete_id, strava_activity_id, strava_imported").eq("ride_id", rideId);
    if (error) throw error;
    const members: Matched[] = [];
    for (const entry of existing ?? []) {
      if (!entry.strava_imported) break;
      const linked = all.find((item) => item.rider.id === entry.athlete_id);
      if (!linked || !entry.strava_activity_id) break;
      const match = selected.find((item) => item.activity.id === entry.strava_activity_id)
        ?? await detailFor(linked, entry.strava_activity_id, mode);
      if (!match) break;
      members.push(match);
    }
    if (members.length !== (existing ?? []).length ||
        members.some((member) => score(member.match, target.match) === null && member.activity.id !== target.activity.id)) continue;
    reusable.push({ ride, members });
  }
  reusable.sort((a, b) =>
    Number(b.ride.review_status === "approved") - Number(a.ride.review_status === "approved") ||
    b.members.length - a.members.length || a.ride.created_at.localeCompare(b.ride.created_at));
  for (const chosen of reusable) {
    let changed = false;
    for (const source of reusable) {
      if (source.ride.id === chosen.ride.id || source.members.length !== 1) continue;
      const member = source.members[0];
      if (!selected.some((item) => item.activity.id === member.activity.id) ||
          chosen.members.some((item) => item.rider.id === member.rider.id) ||
          !chosen.members.every((item) => score(item.match, member.match) !== null)) continue;
      const { data: merged, error: mergeError } = await admin.rpc("merge_strava_singleton", {
        p_target_ride_id: chosen.ride.id, p_source_ride_id: source.ride.id,
      });
      if (mergeError) throw mergeError;
      if (merged) { chosen.members.push(member); changed = true; }
    }
    const additions = selected.filter((item) =>
      !importedRideByActivity.has(item.activity.id) &&
      !chosen.members.some((member) => member.rider.id === item.rider.id) &&
      chosen.members.every((member) => score(member.match, item.match) !== null));
    if (additions.length) {
      await addEntries(chosen.ride.id, additions);
      changed = true;
    }
    if (changed && chosen.members.length + additions.length > 1) await promoteToGroup(chosen.ride);
    return;
  }

  const fresh = selected.filter((item) => !importedRideByActivity.has(item.activity.id));
  if (!fresh.length) return;
  const rideDate = target.activity.start_date_local.slice(0, 10);
  const sectionSlugs = [...new Set(fresh.map((item) => item.rider.section_slug))];
  const { data: sections, error: sectionError } = await admin.from("sections")
    .select("id, slug").eq("active", true);
  if (sectionError) throw sectionError;
  const sectionId = sectionSlugs.length === 1
    ? (sections ?? []).find((section) => section.slug === sectionSlugs[0])?.id ?? null : null;
  const { data: ride, error: rideError } = await admin.from("training_rides").insert({
    ride_date: rideDate, kind: fresh.length === 1 ? "solo" : "group", review_status: "under_review",
    title: suggestedTitle(fresh.map((item) => item.activity), rideDate, mode === "indoor"),
    focus: suggestedFocus(fresh.map((item) => item.activity), mode === "indoor"), section_id: sectionId,
    distance_km: Math.round(median(fresh.map((item) => item.activity.distance)) / 10) / 100,
    moving_seconds: median(fresh.map((item) => item.activity.moving_time)),
    elevation_m: Math.round(median(fresh.map((item) => item.activity.total_elevation_gain))),
    strava_url: `https://www.strava.com/activities/${target.activity.id}`,
  }).select("id").single();
  if (rideError || !ride) throw rideError ?? new Error("Could not save Strava review ride");
  try { await addEntries(ride.id, fresh); }
  catch (error) {
    await admin.from("training_rides").delete().eq("id", ride.id);
    throw error;
  }
}

export async function processQueuedStravaActivities(batchSize = 5): Promise<{ processed: number; failed: number }> {
  const admin = createAdminClient();
  const { data: events, error } = await admin.rpc("claim_strava_activity_events", { batch_size: batchSize });
  if (error) throw error;
  let processed = 0, failed = 0;
  for (const event of events ?? []) {
    try {
      if (event.event_kind === "upsert") await processActivity(event);
      else {
        const { data: connection, error: lookupError } = await admin.from("strava_connections")
          .select("athlete_id").eq("strava_athlete_id", event.owner_id).maybeSingle();
        if (lookupError) throw lookupError;
        if (connection) {
          const { removeImportedStravaData } = await import("@/lib/strava-cleanup");
          await removeImportedStravaData(connection.athlete_id,
            event.event_kind === "delete" ? event.activity_id : undefined);
          if (event.event_kind === "revoke") {
            const { error: deleteError } = await admin.from("strava_connections")
              .delete().eq("athlete_id", connection.athlete_id);
            if (deleteError) throw deleteError;
          }
        }
      }
      const { error: saveError } = await admin.from("strava_activity_events").update({
        processed_at: new Date().toISOString(), claimed_until: null, last_error: null,
      }).eq("event_kind", event.event_kind).eq("activity_id", event.activity_id)
        .eq("event_time", event.event_time);
      if (saveError) throw saveError;
      processed++;
    } catch (cause) {
      failed++;
      const message = cause instanceof Error ? cause.message : String(cause);
      const delaySeconds = message.includes("kufiri") ? 15 * 60 : Math.min(24 * 3600, 60 * 2 ** Math.min(event.attempts, 10));
      await admin.from("strava_activity_events").update({
        claimed_until: null, next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        last_error: message.slice(0, 500),
      }).eq("event_kind", event.event_kind).eq("activity_id", event.activity_id)
        .eq("event_time", event.event_time);
      console.error("Strava activity sync failed", { kind: event.event_kind, activityId: event.activity_id, error: message });
    }
  }
  return { processed, failed };
}

export async function enqueueRecentStravaActivities(athleteId?: string): Promise<number> {
  const all = (await connections()).filter((owner) => !athleteId || owner.rider.id === athleteId);
  const after = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  let found = 0;
  for (const owner of all) {
    for (let page = 1; page <= 5; page++) {
      const rows = await stravaGet<StravaActivity[]>(owner.connection,
        `/athlete/activities?after=${after}&per_page=100&page=${page}`);
      if (!rows.length) break;
      for (const activity of rows) {
        if (!cyclingMode(activity)) continue;
        await enqueueStravaActivity(activity.id, owner.connection.strava_athlete_id, Math.floor(Date.now() / 1000));
        found++;
      }
    }
  }
  return found;
}
