// Pure route matching; no Strava tokens or database access.
// Every pair in an outdoor group clears the route, time, and elevation checks.
// Indoor groups use start time and duration because virtual routes do not prove
// that cyclists trained together. Coaches review every proposed group.

export type LatLng = [number, number];
export type MatchRide = {
  athleteId: string;
  activityId: string;
  startMs: number;
  elapsedSeconds: number;
  distanceMeters: number;
  elevationMeters: number;
  route: LatLng[];
};

export type MatchGroup = { rides: MatchRide[]; minimumRouteOverlap: number };
export type IndoorMatchGroup = { rides: MatchRide[]; minimumTimeMatch: number };

export const ROUTE_THRESHOLD = 0.6;
const NEAR_METERS = 120;
const MAX_START_GAP_MS = 30 * 60_000;

function distanceMeters(a: LatLng, b: LatLng): number {
  const radians = Math.PI / 180;
  const lat = ((a[0] + b[0]) / 2) * radians;
  const north = (a[0] - b[0]) * 111_195;
  const east = (a[1] - b[1]) * 111_195 * Math.cos(lat);
  return Math.hypot(north, east);
}

function sampleRoute(route: LatLng[]): LatLng[] {
  if (route.length < 2) return [];
  const segments = route.slice(1).map((point, index) => distanceMeters(route[index], point));
  const total = segments.reduce((sum, length) => sum + length, 0);
  if (total < 2_000) return [];
  const step = Math.max(100, total / 600);
  const samples: LatLng[] = [route[0]];
  let covered = 0, next = step;
  for (let i = 0; i < segments.length; i++) {
    const length = segments[i];
    if (length <= 0) continue;
    while (next <= covered + length) {
      const fraction = (next - covered) / length;
      samples.push([
        route[i][0] + fraction * (route[i + 1][0] - route[i][0]),
        route[i][1] + fraction * (route[i + 1][1] - route[i][1]),
      ]);
      next += step;
    }
    covered += length;
  }
  samples.push(route[route.length - 1]);
  return samples;
}

function fractionNear(source: LatLng[], target: LatLng[]): number {
  let near = 0;
  for (const point of source) {
    if (target.some((other) => distanceMeters(point, other) <= NEAR_METERS)) near++;
  }
  return near / source.length;
}

/** The lesser of both directions prevents a short shared segment matching a long ride. */
export function routeOverlap(a: LatLng[], b: LatLng[]): number {
  const left = sampleRoute(a), right = sampleRoute(b);
  if (!left.length || !right.length) return 0;
  return Math.min(fractionNear(left, right), fractionNear(right, left));
}

/** Returns the GPS overlap only if every independent group-ride check passes. */
export function matchRides(a: MatchRide, b: MatchRide): number | null {
  if (a.athleteId === b.athleteId || a.activityId === b.activityId) return null;
  if (!Number.isFinite(a.startMs) || !Number.isFinite(b.startMs)) return null;
  if (!a.elapsedSeconds || !b.elapsedSeconds || Math.abs(a.startMs - b.startMs) > MAX_START_GAP_MS) return null;
  const endA = a.startMs + a.elapsedSeconds * 1000;
  const endB = b.startMs + b.elapsedSeconds * 1000;
  const sharedTime = Math.max(0, Math.min(endA, endB) - Math.max(a.startMs, b.startMs));
  if (sharedTime < 0.7 * Math.min(a.elapsedSeconds, b.elapsedSeconds) * 1000) return null;
  if (Math.abs(a.elevationMeters - b.elevationMeters) > Math.max(150, 0.2 * Math.max(a.elevationMeters, b.elevationMeters))) return null;
  if (Math.abs(a.distanceMeters - b.distanceMeters) > Math.max(3_000, 0.25 * Math.max(a.distanceMeters, b.distanceMeters))) return null;
  const overlap = routeOverlap(a.route, b.route);
  return overlap >= ROUTE_THRESHOLD ? overlap : null;
}

/** Indoor sessions must start together and run for similar lengths of time. */
export function matchIndoorRides(a: MatchRide, b: MatchRide): number | null {
  if (a.athleteId === b.athleteId || a.activityId === b.activityId) return null;
  if (!Number.isFinite(a.startMs) || !Number.isFinite(b.startMs) ||
      !Number.isFinite(a.elapsedSeconds) || !Number.isFinite(b.elapsedSeconds) ||
      a.elapsedSeconds <= 0 || b.elapsedSeconds <= 0) return null;
  if (Math.abs(a.startMs - b.startMs) > 10 * 60_000) return null;
  const shorter = Math.min(a.elapsedSeconds, b.elapsedSeconds);
  const longer = Math.max(a.elapsedSeconds, b.elapsedSeconds);
  const durationRatio = shorter / longer;
  if (durationRatio < 0.8) return null;
  const shared = Math.max(0, Math.min(a.startMs + a.elapsedSeconds * 1000, b.startMs + b.elapsedSeconds * 1000) -
    Math.max(a.startMs, b.startMs));
  const overlap = shared / (shorter * 1000);
  return overlap >= 0.8 ? Math.min(durationRatio, overlap) : null;
}

function groupByMatch(rides: MatchRide[], match: (a: MatchRide, b: MatchRide) => number | null) {
  const remaining = [...rides].sort((a, b) => a.startMs - b.startMs || a.activityId.localeCompare(b.activityId));
  const groups: { rides: MatchRide[]; minimumScore: number }[] = [];
  while (remaining.length) {
    const group = [remaining.shift()!];
    let minimumScore = 1;
    for (let i = 0; i < remaining.length;) {
      const candidate = remaining[i];
      const scores = group.map((member) => match(member, candidate));
      if (scores.every((score) => score !== null)) {
        minimumScore = Math.min(minimumScore, ...(scores as number[]));
        group.push(candidate);
        remaining.splice(i, 1);
      } else i++;
    }
    if (group.length > 1) groups.push({ rides: group, minimumScore });
  }
  return groups;
}

export function groupMatchingRides(rides: MatchRide[]): MatchGroup[] {
  return groupByMatch(rides, matchRides).map(({ rides, minimumScore }) => ({ rides, minimumRouteOverlap: minimumScore }));
}

export function groupMatchingIndoorRides(rides: MatchRide[]): IndoorMatchGroup[] {
  return groupByMatch(rides, matchIndoorRides).map(({ rides, minimumScore }) => ({ rides, minimumTimeMatch: minimumScore }));
}

/** Decode a Google encoded polyline (precision 5), as returned by Strava. */
export function decodePolyline(encoded: string | null | undefined): LatLng[] {
  if (!encoded) return [];
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0, shift = 0, byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}
