export const FORTY_KM_METERS = 40_000;

export type DistanceStreams = {
  time?: { data?: number[] };
  distance?: { data?: number[] };
  moving?: { data?: boolean[] };
};

export type FortyKmWindow = {
  durationSeconds: number;
  elapsedSeconds: number;
  startSecond: number;
  endSecond: number;
  usesMovingTime: boolean;
};

/** Fastest continuous 40 km in a ride, with distance-boundary interpolation.
 * Uses Strava's moving flags for average speed where those are available. */
export function bestFortyKm(streams: DistanceStreams): FortyKmWindow | null {
  const time = streams.time?.data, distance = streams.distance?.data;
  if (!time || !distance || time.length !== distance.length || time.length < 2) return null;
  const n = time.length;
  if (distance[n - 1] - distance[0] < FORTY_KM_METERS) return null;
  const moving = streams.moving?.data?.length === n ? streams.moving.data : null;
  const duration = [0];
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(time[i]) || !Number.isFinite(time[i - 1]) ||
        !Number.isFinite(distance[i]) || !Number.isFinite(distance[i - 1]) ||
        time[i] <= time[i - 1] || distance[i] < distance[i - 1]) return null;
    duration.push(duration[i - 1] + (moving && !moving[i - 1] ? 0 : time[i] - time[i - 1]));
  }

  const atDistance = (meters: number) => {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distance[mid] < meters) lo = mid + 1;
      else hi = mid;
    }
    const j = lo;
    if (j === 0 || distance[j] === meters) return { time: time[j], duration: duration[j] };
    const share = (meters - distance[j - 1]) / (distance[j] - distance[j - 1]);
    return {
      time: time[j - 1] + (time[j] - time[j - 1]) * share,
      duration: duration[j - 1] + (duration[j] - duration[j - 1]) * share,
    };
  };

  let best: FortyKmWindow | null = null;
  const consider = (startMeters: number) => {
    const start = atDistance(startMeters), end = atDistance(startMeters + FORTY_KM_METERS);
    const seconds = end.duration - start.duration;
    if (seconds <= 0 || !Number.isFinite(seconds)) return;
    if (!best || seconds < best.durationSeconds) best = {
      durationSeconds: seconds, elapsedSeconds: end.time - start.time,
      startSecond: start.time, endSecond: end.time, usesMovingTime: !!moving,
    };
  };
  for (let i = 0; i < n; i++) {
    if (distance[i] + FORTY_KM_METERS <= distance[n - 1]) consider(distance[i]);
    if (distance[i] - FORTY_KM_METERS >= distance[0]) consider(distance[i] - FORTY_KM_METERS);
  }
  return best;
}

export function fortyKmSpeed(durationSeconds: number): number {
  return 144_000 / durationSeconds;
}
