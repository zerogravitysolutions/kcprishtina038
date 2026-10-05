import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { stravaGet, type StravaActivity, type StravaConnection } from "@/lib/strava-api";
import { matchIndoorRides, matchRides, type LatLng, type MatchRide } from "@/lib/strava-match";
import { cyclingMode } from "@/lib/strava-cycling";
import { syncFortyKmEffort } from "@/lib/strava-forty-km-sync";
import { qualifiesAsTraining } from "@/lib/strava-qualify";
import { metricsFromStrava, missingImportedMetrics } from "@/lib/strava-metrics";
import { median, suggestedFocus, suggestedTitle } from "@/lib/strava-suggestions";
import { refreshSegmentSummary, segmentIdsForActivity, syncActivitySegments } from "@/lib/strava-segment-sync";
import {
  activityDetail, activityRoute, activityStreams, athleteFtp, cachedActivitiesNear, cachedActivity,
  fetchActivity, markFortyKmChecked, type ActivityStreams,
} from "@/lib/strava-cache";
import { addDays } from "@/lib/kpi";
import type { TableInsert, TableRow, TableUpdate } from "@/lib/supabase/types";

const START_WINDOW_MS = 31 * 60_000;
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

function matched(owner: Connected, activity: StravaActivity): Matched {
  return { ...owner, activity, match: asMatch(owner.rider, activity, activityRoute(activity)) };
}

/** A rider's activity from the cache, or one Strava read if we never saw it. */
async function matchFor(owner: Connected, activityId: number, mode: "indoor" | "outdoor"): Promise<Matched | null> {
  const activity = await activityDetail(owner.connection, activityId);
  if (!activity || activity.id !== activityId || cyclingMode(activity) !== mode || activity.elapsed_time <= 0) return null;
  return matched(owner, activity);
}

async function promoteToGroup(ride: { id: string; ride_date: string; title: string | null; focus: string | null }) {
  const update: TableUpdate<"training_rides"> = { kind: "group" };
  if (ride.focus === "Dalje individuale") update.focus = "Dalje grupore";
  if (ride.title === `Dalje individuale · ${ride.ride_date}`) update.title = `Dalje grupore · ${ride.ride_date}`;
  const { error } = await createAdminClient().from("training_rides").update(update).eq("id", ride.id);
  if (error) throw error;
}

type StreamsFor = (item: Matched) => Promise<ActivityStreams>;
const readStreams: StreamsFor = (item) => activityStreams(item.connection, item.activity.id);

async function metricsFor(item: Matched, fallbackFtp: number | null, streamsFor: StreamsFor = readStreams) {
  const [streams, ftp] = await Promise.all([streamsFor(item), athleteFtp(item.connection)]);
  return metricsFromStrava(item.activity, streams, ftp, fallbackFtp);
}

async function addEntries(rideId: string, items: Matched[], streamsFor: StreamsFor = readStreams): Promise<void> {
  if (!items.length) return;
  const admin = createAdminClient();
  const { data: profiles, error: profilesError } = await admin.from("athlete_profiles")
    .select("athlete_id, ftp_w").in("athlete_id", items.map((item) => item.rider.id));
  if (profilesError) throw profilesError;
  const ftpById = new Map((profiles ?? []).map((profile) => [profile.athlete_id, profile.ftp_w]));
  const entries: TableInsert<"ride_entries">[] = await Promise.all(items.map(async (item) => ({
    ride_id: rideId, athlete_id: item.rider.id,
    ...await metricsFor(item, ftpById.get(item.rider.id) ?? null, streamsFor),
    strava_url: `https://www.strava.com/activities/${item.activity.id}`,
    strava_activity_id: item.activity.id, strava_imported: true,
  })));
  const { error } = await admin.from("ride_entries").insert(entries);
  if (error) throw error;
}

/** Fetch the latest Strava values for an imported entry and fill only empty
 * columns. A coach's saved numbers remain authoritative. */
async function fillMissingMetrics(entry: TableRow<"ride_entries">, item: Matched) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("athlete_profiles")
    .select("ftp_w").eq("athlete_id", entry.athlete_id).maybeSingle();
  if (profileError) throw profileError;
  const imported = await metricsFor(item, profile?.ftp_w ?? null);
  const patch = missingImportedMetrics(entry, imported, profile?.ftp_w ?? null);
  if (Object.keys(patch).length) {
    let update = admin.from("ride_entries").update(patch as TableUpdate<"ride_entries">).eq("id", entry.id)
      .eq("ride_id", entry.ride_id);
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
  if (!entry?.strava_imported || !entry.strava_activity_id) {
    throw new Error("Vetëm aktivitetet e importuara nga Strava mund të rifreskohen.");
  }
  const owner = (await connections()).find((item) => item.rider.id === entry.athlete_id);
  if (!owner) throw new Error("Lidhja e çiklistit me Strava nuk është më aktive.");
  const activity = await activityDetail(owner.connection, entry.strava_activity_id);
  if (!activity || !cyclingMode(activity)) throw new Error("Aktiviteti i lidhur nuk është më i disponueshëm në Strava.");
  return fillMissingMetrics(entry, matched(owner, activity));
}

async function processActivity(event: Event): Promise<void> {
  const all = await connections();
  const owner = all.find((item) => item.connection.strava_athlete_id === event.owner_id);
  if (!owner) return; // disconnected or no longer an active club rider
  // Reuse the stored detail unless Strava reported a change after we read it.
  const cached = await cachedActivity(event.activity_id);
  const current = !!cached && cached.athleteId === owner.rider.id && !!cached.fetchedAt &&
    Date.parse(cached.fetchedAt) >= event.event_time * 1000;
  const activity = current ? cached!.activity : await fetchActivity(owner.connection, event.activity_id);
  if (!activity) return;
  const mode = cyclingMode(activity);
  if (!mode) {
    const { removeImportedStravaData } = await import("@/lib/strava-cleanup");
    const segmentIds = await segmentIdsForActivity(owner.rider.id, activity.id);
    await removeImportedStravaData(owner.rider.id, activity.id, { keepCache: true });
    for (const segmentId of segmentIds) await refreshSegmentSummary(owner.connection, segmentId);
    return;
  }
  await syncActivitySegments(owner.connection, activity);
  // One streams read serves the 40 km window and the training metrics.
  let streams: Promise<ActivityStreams> | undefined;
  const targetStreams = () => streams ??= activityStreams(owner.connection, activity.id);
  const streamsFor: StreamsFor = (item) => item.activity.id === activity.id ? targetStreams() : readStreams(item);
  if (!cached?.fortyKmChecked) {
    await syncFortyKmEffort(owner.connection, activity, targetStreams);
    await markFortyKmChecked(owner.connection, activity);
  }
  if (!qualifiesAsTraining(activity)) {
    const { removeStravaTraining } = await import("@/lib/strava-cleanup");
    await removeStravaTraining(owner.rider.id, activity.id);
    return;
  }
  const admin = createAdminClient();
  const [{ data: targetDismissal, error: targetDismissalError }, { data: alreadyImported, error: alreadyError }] = await Promise.all([
    admin.from("strava_dismissed_activities").select("strava_activity_id")
      .eq("athlete_id", owner.rider.id).eq("strava_activity_id", activity.id).maybeSingle(),
    admin.from("ride_entries").select("id").eq("athlete_id", owner.rider.id)
      .eq("strava_imported", true).eq("strava_activity_id", activity.id).limit(1),
  ]);
  if (targetDismissalError || alreadyError) throw targetDismissalError ?? alreadyError;
  // A Strava update (title, privacy) changes nothing in an imported training;
  // riders who upload later are grouped when their own activity arrives.
  if (targetDismissal || alreadyImported?.length) return;

  const target = matched(owner, activity);
  const score = mode === "indoor" ? matchIndoorRides : matchRides;
  const byAthlete = new Map(all.map((item) => [item.rider.id, item]));
  const candidates = new Map<number, Matched>();
  for (const row of await cachedActivitiesNear(owner.rider.id, target.match.startMs, START_WINDOW_MS, mode)) {
    const linked = byAthlete.get(row.athleteId);
    if (linked) candidates.set(row.activity.id, matched(linked, row.activity));
  }
  // Trainings imported before the activity cache existed: each is read once.
  const day = activity.start_date_local.slice(0, 10);
  const { data: legacy, error: legacyError } = await admin.from("ride_entries")
    .select("athlete_id, strava_activity_id, ride:training_rides!inner(ride_date)")
    .eq("strava_imported", true).neq("athlete_id", owner.rider.id).not("strava_activity_id", "is", null)
    .gte("ride.ride_date", addDays(day, -1)).lte("ride.ride_date", addDays(day, 1));
  if (legacyError) throw legacyError;
  for (const entry of legacy ?? []) {
    const linked = byAthlete.get(entry.athlete_id);
    if (!linked || !entry.strava_activity_id || candidates.has(entry.strava_activity_id)) continue;
    const item = await matchFor(linked, entry.strava_activity_id, mode);
    if (item && Math.abs(item.match.startMs - target.match.startMs) <= START_WINDOW_MS) candidates.set(item.activity.id, item);
  }
  const { data: dismissed, error: dismissedError } = candidates.size
    ? await admin.from("strava_dismissed_activities").select("athlete_id, strava_activity_id")
      .in("strava_activity_id", [...candidates.keys()])
    : { data: [], error: null };
  if (dismissedError) throw dismissedError;
  const dismissedKeys = new Set((dismissed ?? []).map((row) => `${row.athlete_id}:${row.strava_activity_id}`));
  const scored: { item: Matched; overlap: number }[] = [];
  for (const item of candidates.values()) {
    if (dismissedKeys.has(`${item.rider.id}:${item.activity.id}`) ||
        !qualifiesAsTraining(item.activity) || item.activity.elapsed_time <= 0) continue;
    const overlap = score(target.match, item.match);
    if (overlap !== null) scored.push({ item, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  const selected = [target];
  for (const { item } of scored) {
    if (selected.some((current) => current.rider.id === item.rider.id)) continue;
    if (selected.every((current) => score(current.match, item.match) !== null)) selected.push(item);
  }
  const { data: imported, error: importedError } = await admin.from("ride_entries")
    .select("ride_id, athlete_id, strava_activity_id")
    .eq("strava_imported", true)
    .in("strava_activity_id", selected.map((item) => item.activity.id));
  if (importedError) throw importedError;
  const importedRideByActivity = new Map((imported ?? []).map((entry) => [entry.strava_activity_id, entry.ride_id]));
  const rideIds = [...new Set((imported ?? []).map((entry) => entry.ride_id))];

  const reusable: {
    ride: { id: string; ride_date: string; title: string | null; focus: string | null; created_at: string };
    members: Matched[];
  }[] = [];
  for (const rideId of rideIds) {
    const { data: ride, error: rideError } = await admin.from("training_rides")
      .select("id, ride_date, title, focus, created_at").eq("id", rideId).maybeSingle();
    if (rideError) throw rideError;
    if (!ride) continue;
    const { data: existing, error } = await admin.from("ride_entries")
      .select("athlete_id, strava_activity_id, strava_imported").eq("ride_id", rideId);
    if (error) throw error;
    const members: Matched[] = [];
    for (const entry of existing ?? []) {
      if (!entry.strava_imported) break;
      const linked = byAthlete.get(entry.athlete_id);
      if (!linked || !entry.strava_activity_id) break;
      const match = selected.find((item) => item.activity.id === entry.strava_activity_id)
        ?? await matchFor(linked, entry.strava_activity_id, mode);
      if (!match) break;
      members.push(match);
    }
    if (members.length !== (existing ?? []).length ||
        members.some((member) => score(member.match, target.match) === null && member.activity.id !== target.activity.id)) continue;
    reusable.push({ ride, members });
  }
  reusable.sort((a, b) =>
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
      await addEntries(chosen.ride.id, additions, streamsFor);
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
    ride_date: rideDate, kind: fresh.length === 1 ? "solo" : "group",
    title: suggestedTitle(fresh.map((item) => item.activity), rideDate, mode === "indoor"),
    focus: suggestedFocus(fresh.map((item) => item.activity), mode === "indoor"), section_id: sectionId,
    distance_km: Math.round(median(fresh.map((item) => item.activity.distance)) / 10) / 100,
    moving_seconds: median(fresh.map((item) => item.activity.moving_time)),
    elevation_m: Math.round(median(fresh.map((item) => item.activity.total_elevation_gain))),
    strava_url: `https://www.strava.com/activities/${target.activity.id}`,
  }).select("id").single();
  if (rideError || !ride) throw rideError ?? new Error("Could not save Strava training");
  try { await addEntries(ride.id, fresh, streamsFor); }
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
          const segmentIds = event.event_kind === "delete"
            ? await segmentIdsForActivity(connection.athlete_id, event.activity_id) : [];
          await removeImportedStravaData(connection.athlete_id,
            event.event_kind === "delete" ? event.activity_id : undefined);
          if (event.event_kind === "revoke") {
            const { error: deleteError } = await admin.from("strava_connections")
              .delete().eq("athlete_id", connection.athlete_id);
            if (deleteError) throw deleteError;
          } else if (event.event_kind === "delete") {
            const { data: linked, error: linkedError } = await admin.from("strava_connections")
              .select("*").eq("athlete_id", connection.athlete_id).maybeSingle();
            if (linkedError) throw linkedError;
            // Only the segments this activity crossed can have a changed PB.
            if (linked) for (const segmentId of segmentIds) await refreshSegmentSummary(linked, segmentId);
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

/** Trainings are imported from Strava from this date onward. */
export const TRAINING_IMPORT_START = "2026-07-01";

export async function enqueueRecentStravaActivities(athleteId?: string, since?: string): Promise<number> {
  const all = (await connections()).filter((owner) => !athleteId || owner.rider.id === athleteId);
  const after = since
    ? Math.floor(Date.parse(`${since}T00:00:00Z`) / 1000)
    : Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
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
