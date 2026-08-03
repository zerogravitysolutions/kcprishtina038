// Pure helpers for the coaching / training feature. No server or client deps —
// imported by both server components (aggregation) and client components (the
// entry editor + progress table). The metric field list is the single source
// of truth for BOTH the input form and the server-action parser, so the two
// can never drift apart.

// ------------------------------------------------------------------ metrics

export type MetricKind = "int" | "num" | "text";
export type MetricUi = "number" | "duration" | "text";

export type MetricField = {
  key: string;          // matches a ride_entries column
  label: string;        // Albanian label
  group: MetricGroupKey;
  kind: MetricKind;     // how the server coerces it
  ui: MetricUi;         // how the client renders it
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  summary?: boolean;    // shown in the collapsed one-line summary
};

export type MetricGroupKey = "core" | "hr" | "power" | "bests" | "effort" | "extra";

export const METRIC_GROUPS: { key: MetricGroupKey; label: string }[] = [
  { key: "core",   label: "Bazë" },
  { key: "hr",     label: "Rrahjet (HR)" },
  { key: "power",  label: "Fuqia" },
  { key: "bests",  label: "Fuqia më e mirë" },
  { key: "effort", label: "Përpjekja" },
  { key: "extra",  label: "Shtesë" },
];

export const RIDE_METRIC_FIELDS: MetricField[] = [
  // Core
  { key: "distance_km",     label: "Distanca",     group: "core",   kind: "num", ui: "number",   unit: "km",  step: 0.1, min: 0, summary: true, placeholder: "42.5" },
  { key: "moving_seconds",  label: "Kohëzgjatja",  group: "core",   kind: "int", ui: "duration", summary: true, placeholder: "1:25:00" },
  { key: "elevation_m",     label: "Ngjitja",      group: "core",   kind: "int", ui: "number",   unit: "m",   min: 0, placeholder: "650" },
  // Heart rate
  { key: "avg_hr",          label: "HR mesatar",   group: "hr",     kind: "int", ui: "number",   unit: "bpm", min: 20, max: 260, summary: true, placeholder: "142" },
  { key: "max_hr",          label: "HR maksimal",  group: "hr",     kind: "int", ui: "number",   unit: "bpm", min: 20, max: 260, placeholder: "178" },
  // Power
  { key: "avg_power_w",     label: "Fuqia mes.",   group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, placeholder: "210" },
  { key: "np_w",            label: "NP",           group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, placeholder: "235" },
  { key: "ftp_w",           label: "FTP",          group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, summary: true, placeholder: "260" },
  // Best power
  { key: "best_power_1m_w",  label: "1 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_3m_w",  label: "3 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_5m_w",  label: "5 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_10m_w", label: "10 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0, summary: true },
  { key: "best_power_20m_w", label: "20 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_60m_w", label: "60 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  // Effort
  { key: "tss",             label: "TSS",          group: "effort", kind: "num", ui: "number", step: 1, min: 0, placeholder: "72" },
  { key: "intensity_factor",label: "IF",           group: "effort", kind: "num", ui: "number", step: 0.01, min: 0, placeholder: "0.82" },
  { key: "rpe",             label: "RPE (1–10)",   group: "effort", kind: "int", ui: "number", min: 1, max: 10, placeholder: "6" },
  // Extra
  { key: "elapsed_seconds", label: "Koha totale",  group: "extra",  kind: "int", ui: "duration", placeholder: "1:40:00" },
  { key: "avg_cadence",     label: "Kadenca",      group: "extra",  kind: "int", ui: "number", unit: "rpm", min: 0, placeholder: "88" },
];

export const RIDE_METRIC_BY_KEY: Record<string, MetricField> = Object.fromEntries(
  RIDE_METRIC_FIELDS.map((f) => [f.key, f]),
);

/** Coerce a raw string from a form input into the DB value for a metric. */
export function coerceMetric(
  field: MetricField,
  raw: string,
): { ok: true; value: number | string | null } | { ok: false; error: string } {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: null };
  if (field.kind === "text") return { ok: true, value: v };
  // moving_seconds / elapsed_seconds arrive already converted to a plain
  // integer string by the client (see EntryEditor), so ui:"duration" still
  // parses here as an int.
  const n = field.kind === "int" ? parseInt(v, 10) : parseFloat(v);
  if (Number.isNaN(n)) return { ok: false, error: `${field.label}: numër i pavlefshëm.` };
  if (field.min != null && n < field.min) return { ok: false, error: `${field.label}: minimumi ${field.min}.` };
  if (field.max != null && n > field.max) return { ok: false, error: `${field.label}: maksimumi ${field.max}.` };
  return { ok: true, value: field.kind === "int" ? Math.round(n) : n };
}

// ------------------------------------------------------------------ duration

/** Parse "1:23:45", "23:45", or bare minutes ("90") → seconds. Empty → null. */
export function parseDurationToSeconds(input: string): number | null {
  const s = (input ?? "").trim();
  if (s === "") return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return null;
    let sec = 0;
    for (const p of parts) sec = sec * 60 + p; // supports h:m:s and m:s
    return sec;
  }
  const mins = parseFloat(s);
  if (Number.isNaN(mins)) return null;
  return Math.round(mins * 60); // bare number = minutes
}

/** Seconds → "1:23:45" (or "23:45" when under an hour). "" for null. */
export function formatDurationHMS(sec: number | null | undefined): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Seconds → "1h 23m" / "23m". "—" for null. */
export function formatDurationShort(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Seconds → decimal hours ("12.5"). */
export function toHours(sec: number | null | undefined): number {
  if (!sec) return 0;
  return sec / 3600;
}

// ------------------------------------------------------------------ numbers

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("sq", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Watts-per-kilo, rounded to 2dp. Null when either input is missing. */
export function wPerKg(watts: number | null | undefined, kg: number | null | undefined): number | null {
  if (!watts || !kg) return null;
  return Math.round((watts / kg) * 100) / 100;
}

export function mean(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sum(nums: Array<number | null | undefined>): number {
  return nums.reduce((a: number, b) => a + (typeof b === "number" && !Number.isNaN(b) ? b : 0), 0);
}

// ------------------------------------------------------------------ months

const MONTHS_SQ = [
  "Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor",
  "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor",
];

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS_SQ[((month0 % 12) + 12) % 12]} ${year}`;
}

/** Half-open [start, end) date strings for a month, for ride_date filtering. */
export function monthRange(year: number, month0: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month0 + 1)}-01`;
  const ny = month0 === 11 ? year + 1 : year;
  const nm = month0 === 11 ? 0 : month0 + 1;
  const end = `${ny}-${pad(nm + 1)}-01`;
  return { start, end };
}

export function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

/** Parse a "YYYY-MM" URL param, falling back to the given default. */
export function parseMonthParam(param: string | undefined, fallback: { year: number; month0: number }): { year: number; month0: number } {
  if (param) {
    const m = param.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      if (mo >= 0 && mo <= 11) return { year: y, month0: mo };
    }
  }
  return fallback;
}

export function monthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ aggregation

export type EntryLike = {
  athlete_id: string;
  participated: boolean;
  distance_km: number | null;
  moving_seconds: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_w: number | null;
  ftp_w: number | null;
  best_power_1m_w: number | null;
  best_power_3m_w: number | null;
  best_power_5m_w: number | null;
  best_power_10m_w: number | null;
  best_power_20m_w: number | null;
  best_power_60m_w: number | null;
};

export type AthleteBests = {
  best_power_1m_w: number | null;
  best_power_3m_w: number | null;
  best_power_5m_w: number | null;
  best_power_10m_w: number | null;
  best_power_20m_w: number | null;
  best_power_60m_w: number | null;
  max_hr: number | null;
  best_avg_power_w: number | null;
  longest_km: number | null;
  most_elevation_m: number | null;
  rides: number;        // participated entries
  total_km: number;
  total_seconds: number;
};

function maxOf(nums: Array<number | null>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number");
  return vals.length ? Math.max(...vals) : null;
}

/** All-time bests + totals from an athlete's entries. */
export function computeBests(entries: EntryLike[]): AthleteBests {
  const done = entries.filter((e) => e.participated);
  return {
    best_power_1m_w:  maxOf(entries.map((e) => e.best_power_1m_w)),
    best_power_3m_w:  maxOf(entries.map((e) => e.best_power_3m_w)),
    best_power_5m_w:  maxOf(entries.map((e) => e.best_power_5m_w)),
    best_power_10m_w: maxOf(entries.map((e) => e.best_power_10m_w)),
    best_power_20m_w: maxOf(entries.map((e) => e.best_power_20m_w)),
    best_power_60m_w: maxOf(entries.map((e) => e.best_power_60m_w)),
    max_hr:           maxOf(entries.map((e) => e.max_hr)),
    best_avg_power_w: maxOf(entries.map((e) => e.avg_power_w)),
    longest_km:       maxOf(entries.map((e) => e.distance_km)),
    most_elevation_m: maxOf(entries.map((e) => e.elevation_m)),
    rides:            done.length,
    total_km:         sum(done.map((e) => e.distance_km)),
    total_seconds:    sum(done.map((e) => e.moving_seconds)),
  };
}

export type MonthlyStat = {
  athlete_id: string;
  participations: number;
  total_km: number;
  total_seconds: number;
  total_elevation: number;
  avg_hr: number | null;
  avg_ftp: number | null;
  avg_power: number | null;
  avg_5m: number | null;
  avg_10m: number | null;
  avg_20m: number | null;
};

/** Per-athlete monthly rollup from the month's entries. */
export function aggregateMonthly(entries: EntryLike[]): Map<string, MonthlyStat> {
  const byAthlete = new Map<string, EntryLike[]>();
  for (const e of entries) {
    if (!byAthlete.has(e.athlete_id)) byAthlete.set(e.athlete_id, []);
    byAthlete.get(e.athlete_id)!.push(e);
  }
  const out = new Map<string, MonthlyStat>();
  for (const [athlete_id, list] of byAthlete) {
    const done = list.filter((e) => e.participated);
    out.set(athlete_id, {
      athlete_id,
      participations: done.length,
      total_km: sum(done.map((e) => e.distance_km)),
      total_seconds: sum(done.map((e) => e.moving_seconds)),
      total_elevation: sum(done.map((e) => e.elevation_m)),
      avg_hr: mean(done.map((e) => e.avg_hr)),
      avg_ftp: mean(done.map((e) => e.ftp_w)),
      avg_power: mean(done.map((e) => e.avg_power_w)),
      avg_5m: mean(done.map((e) => e.best_power_5m_w)),
      avg_10m: mean(done.map((e) => e.best_power_10m_w)),
      avg_20m: mean(done.map((e) => e.best_power_20m_w)),
    });
  }
  return out;
}
