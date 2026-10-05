// A rider's FTP and max HR come from their imported activities, not from
// typed-in profile values. Pure helpers, shared by the coach and rider pages
// and the Strava import.

/** Days of rides considered for the FTP estimate. */
export const FTP_WINDOW_DAYS = 42;
/** Standard estimate: FTP ≈ 95% of the best 20-minute power. */
export const FTP_FACTOR = 0.95;
/** Days of rides considered for the highest heart rate. */
export const MAX_HR_WINDOW_DAYS = 365;

export type AthleteActivity = {
  ride_date: string;
  participated: boolean;
  best_power_20m_w: number | null;
  max_hr: number | null;
  ftp_w: number | null;
};

export type DerivedFtp = { watts: number; source: "estimate" | "latest"; date: string; best20?: number };
export type DerivedMaxHr = { bpm: number; date: string };

const DAY_MS = 86_400_000;
const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);

export function estimateFtp(best20: number | null | undefined): number | null {
  return best20 && best20 > 0 ? Math.round(best20 * FTP_FACTOR) : null;
}

/** 95% of the best 20-min power from rides in the 6 weeks up to `today`;
 * without power data in that window, the FTP used on the latest ride. */
export function derivedFtp(rows: AthleteActivity[], today: string): DerivedFtp | null {
  const since = daysBefore(today, FTP_WINDOW_DAYS);
  let best: AthleteActivity | null = null;
  for (const row of rows) {
    if (!row.participated || row.ride_date <= since || row.ride_date > today || !row.best_power_20m_w) continue;
    if (!best || row.best_power_20m_w > best.best_power_20m_w!) best = row;
  }
  if (best) return { watts: estimateFtp(best.best_power_20m_w)!, source: "estimate", date: best.ride_date, best20: best.best_power_20m_w! };
  const latest = rows.filter((row) => row.participated && row.ftp_w && row.ride_date <= today)
    .sort((a, b) => b.ride_date.localeCompare(a.ride_date))[0];
  return latest ? { watts: latest.ftp_w!, source: "latest", date: latest.ride_date } : null;
}

/** Highest heart rate recorded in the last 12 months. */
export function derivedMaxHr(rows: AthleteActivity[], today: string): DerivedMaxHr | null {
  const since = daysBefore(today, MAX_HR_WINDOW_DAYS);
  let best: DerivedMaxHr | null = null;
  for (const row of rows) {
    if (!row.participated || !row.max_hr || row.ride_date <= since || row.ride_date > today) continue;
    if (!best || row.max_hr > best.bpm) best = { bpm: row.max_hr, date: row.ride_date };
  }
  return best;
}
