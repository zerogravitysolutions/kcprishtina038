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
  computed?: boolean;   // derived (read-only) — not typed by the coach
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
  { key: "avg_power_w",     label: "Fuqia mesatare", group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, placeholder: "210" },
  { key: "np_w",            label: "NP",           group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, placeholder: "235" },
  { key: "ftp_w",           label: "FTP",          group: "power",  kind: "int", ui: "number",   unit: "W",   min: 0, summary: true, placeholder: "260" },
  // Best power
  { key: "best_power_1m_w",  label: "1 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_3m_w",  label: "3 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_5m_w",  label: "5 min",  group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_10m_w", label: "10 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0, summary: true },
  { key: "best_power_20m_w", label: "20 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  { key: "best_power_60m_w", label: "60 min", group: "bests", kind: "int", ui: "number", unit: "W", min: 0 },
  // Effort — IF and TSS are auto-computed from NP + FTP + moving time (read-only).
  { key: "intensity_factor",label: "IF",           group: "effort", kind: "num", ui: "number", computed: true },
  { key: "tss",             label: "TSS",          group: "effort", kind: "num", ui: "number", computed: true },
  { key: "rpe",             label: "RPE (1–10)",   group: "effort", kind: "int", ui: "number", min: 1, max: 10, placeholder: "6" },
  // Extra
  { key: "avg_cadence",     label: "Kadenca",      group: "extra",  kind: "int", ui: "number", unit: "rpm", min: 0, placeholder: "88" },
];

/** Intensity Factor = Normalized Power ÷ FTP. Null if either is missing. */
export function computeIntensity(np: number | null | undefined, ftp: number | null | undefined): number | null {
  if (!np || !ftp) return null;
  return Math.round((np / ftp) * 100) / 100;
}

/** Training Stress Score = (sec · NP² / FTP²) / 3600 · 100. Null if inputs missing. */
export function computeTss(seconds: number | null | undefined, np: number | null | undefined, ftp: number | null | undefined): number | null {
  if (!seconds || !np || !ftp) return null;
  return Math.round(((seconds * np * np) / (ftp * ftp * 3600)) * 100);
}

export const RIDE_METRIC_BY_KEY: Record<string, MetricField> = Object.fromEntries(
  RIDE_METRIC_FIELDS.map((f) => [f.key, f]),
);

// ------------------------------------------------------------------ focus (workout type)
// `value` is the short label stored on training_rides.focus (compact for lists
// and titles); `label` is the full description shown in the dropdown.
export const TRAINING_FOCUS: { value: string; label: string }[] = [
  { value: "Recovery (Z1)",      label: "Recovery – Rikuperim aktiv (Z1)" },
  { value: "Endurance (Z2)",     label: "Endurance (Base) – Qëndrueshmëri aerobike (Z2)" },
  { value: "Tempo (Z3)",         label: "Tempo – Ritëm i qëndrueshëm (Z3)" },
  { value: "Sweet Spot",         label: "Sweet Spot – Rritje efikase e FTP (88–94% FTP)" },
  { value: "Threshold",          label: "Threshold – Pragu i laktatit / FTP (95–105% FTP)" },
  { value: "VO₂ Max",            label: "VO₂ Max – Rritja e kapacitetit maksimal aerobik (106–120% FTP)" },
  { value: "Anaerobic & Sprint", label: "Anaerobic & Sprint – Fuqi shpërthyese dhe sprint (>120% FTP)" },
  { value: "Skills & Strength",  label: "Skills & Strength – Teknikë, kadencë, forcë në biçikletë dhe jashtë saj" },
  { value: "Intervale (HIIT)",   label: "Intervale (HIIT) – Intervale të shkurtra me intensitet të lartë" },
  { value: "Climbing",           label: "Climbing – Stërvitje ngjitjeje / kodra" },
  { value: "Kronometër (TT)",    label: "Kronometër (TT) – Provë kohore individuale" },
  { value: "Long Ride",          label: "Long Ride – Dalje e gjatë (vëllim aerobik)" },
  { value: "Dalje grupore",      label: "Dalje grupore – Stërvitje e përbashkët në grup" },
  { value: "Garë / Simulim",     label: "Garë / Simulim – Garë zyrtare ose simulim gare" },
];

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

// ------------------------------------------------------------------ weekly

const MONTHS_SHORT_SQ = ["Jan", "Shk", "Mar", "Pri", "Maj", "Qer", "Kor", "Gus", "Sht", "Tet", "Nën", "Dhj"];

// Monday (local midnight) of the week containing d.
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

export type WeekBar = { label: string; km: number; hours: number; rides: number };

/** Bucket participated rides into the last `weeks` Monday-started weeks. */
export function weeklyVolume(
  rows: { ride_date: string; distance_km: number | null; moving_seconds: number | null; participated: boolean }[],
  weeks = 12,
  today: Date = new Date(),
): WeekBar[] {
  const startMon = mondayOf(today);
  const buckets: WeekBar[] = [];
  const indexByTime = new Map<number, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(startMon);
    s.setDate(startMon.getDate() - i * 7);
    indexByTime.set(s.getTime(), buckets.length);
    buckets.push({ label: `${s.getDate()} ${MONTHS_SHORT_SQ[s.getMonth()]}`, km: 0, hours: 0, rides: 0 });
  }
  for (const r of rows) {
    if (!r.participated || !r.ride_date) continue;
    const idx = indexByTime.get(mondayOf(new Date(r.ride_date + "T00:00:00")).getTime());
    if (idx == null) continue;
    buckets[idx].km += r.distance_km ?? 0;
    buckets[idx].hours += (r.moving_seconds ?? 0) / 3600;
    buckets[idx].rides += 1;
  }
  return buckets.map((b) => ({ label: b.label, km: Math.round(b.km * 10) / 10, hours: Math.round(b.hours * 10) / 10, rides: b.rides }));
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
