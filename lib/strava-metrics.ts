import { computeIntensity, computeTss } from "./training";

export type ActivityMetrics = {
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  average_cadence?: number;
};

export type PowerStreams = {
  time?: { data?: number[] };
  watts?: { data?: number[] };
};

export type ImportedMetrics = {
  distance_km: number | null;
  moving_seconds: number | null;
  elapsed_seconds: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_w: number | null;
  np_w: number | null;
  ftp_w: number | null;
  best_power_1m_w: number | null;
  best_power_3m_w: number | null;
  best_power_5m_w: number | null;
  best_power_10m_w: number | null;
  best_power_20m_w: number | null;
  best_power_60m_w: number | null;
  intensity_factor: number | null;
  tss: number | null;
  avg_cadence: number | null;
};

function finite(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function heartRate(value: number | undefined): number | null {
  const bpm = finite(value);
  return bpm !== null && bpm >= 20 && bpm <= 260 ? Math.round(bpm) : null;
}

/** Peak mean watts for each duration, using time-weighted samples. Gaps over
 * 30 seconds break a continuous effort, so a stopped recording cannot inflate
 * an average. No power values are stored beyond the derived peaks. */
export function bestPower(watts: number[] | undefined, times: number[] | undefined): Record<number, number | null> {
  const windows = [60, 180, 300, 600, 1200, 3600];
  const result: Record<number, number | null> = Object.fromEntries(windows.map((seconds) => [seconds, null]));
  if (!watts || !times || watts.length !== times.length || times.length < 2) return result;

  let start = 0;
  while (start < times.length - 1) {
    let end = start;
    while (end < times.length - 1 &&
      Number.isFinite(times[end]) && Number.isFinite(times[end + 1]) &&
      Number.isFinite(watts[end]) && watts[end] >= 0 &&
      times[end + 1] > times[end] && times[end + 1] - times[end] <= 30) end++;

    if (end > start) {
      const cumulative = [0];
      for (let i = start; i < end; i++) {
        cumulative.push(cumulative[cumulative.length - 1] + watts[i] * (times[i + 1] - times[i]));
      }
      for (const window of windows) {
        if (times[end] - times[start] < window) continue;
        let right = start;
        for (let left = start; left < end; left++) {
          const finish = times[left] + window;
          if (finish > times[end]) break;
          while (right + 1 <= end && times[right + 1] <= finish) right++;
          const integral = cumulative[right - start] - cumulative[left - start] +
            (right < end ? watts[right] * (finish - times[right]) : 0);
          const value = Math.round(integral / window);
          result[window] = Math.max(result[window] ?? 0, value);
        }
      }
    }
    start = Math.max(end + 1, start + 1);
  }
  return result;
}

export function metricsFromStrava(activity: ActivityMetrics, streams?: PowerStreams, stravaFtp?: number | null,
  fallbackFtp?: number | null): ImportedMetrics {
  const ftp = finite(stravaFtp ?? undefined);
  const effectiveFtp = ftp ?? finite(fallbackFtp ?? undefined);
  const np = finite(activity.weighted_average_watts);
  const moving = finite(activity.moving_time);
  const peaks = bestPower(streams?.watts?.data, streams?.time?.data);
  return {
    distance_km: finite(activity.distance) === null ? null : Math.round(activity.distance / 10) / 100,
    moving_seconds: moving === null ? null : Math.round(moving),
    elapsed_seconds: finite(activity.elapsed_time) === null ? null : Math.round(activity.elapsed_time),
    elevation_m: finite(activity.total_elevation_gain) === null ? null : Math.round(activity.total_elevation_gain),
    avg_hr: heartRate(activity.average_heartrate),
    max_hr: heartRate(activity.max_heartrate),
    avg_power_w: finite(activity.average_watts) === null ? null : Math.round(activity.average_watts!),
    np_w: np === null ? null : Math.round(np),
    ftp_w: ftp === null ? null : Math.round(ftp),
    best_power_1m_w: peaks[60], best_power_3m_w: peaks[180], best_power_5m_w: peaks[300],
    best_power_10m_w: peaks[600], best_power_20m_w: peaks[1200], best_power_60m_w: peaks[3600],
    intensity_factor: computeIntensity(np, effectiveFtp),
    tss: computeTss(moving, np, effectiveFtp),
    avg_cadence: finite(activity.average_cadence) === null ? null : Math.round(activity.average_cadence!),
  };
}
