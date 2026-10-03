// Training KPIs — pure helpers (no server or client deps), shared by the coach
// KPI page, the athlete page and the cyclist's own portal page.
//
// Nothing here is typed in. Every number is derived from the ride_entries the
// coach already registers under Stërvitjet:
//   hours      sum(moving_seconds) of participated entries
//   climbing   sum(elevation_m)    of participated entries
//   power20    max(best_power_20m_w) in the period (the best 20-min effort)
// The stored inputs are the team's weekly target for hours and climbing
// (team_kpi_targets, "from this date on") and, optionally, a 20-minute power
// target per rider per month (athlete_ftp_targets). A month with no such target
// is measured against the cyclist's own best of the PREVIOUS month.
//
// Dates are "YYYY-MM-DD" strings handled with Date.UTC arithmetic — never
// new Date("2026-08-18"), which shifts the day west of Greenwich. "Today" is
// always passed IN (computed on the server with clubTodayISO), never read here.

import { parseStrictNumber } from "@/lib/training";

// ------------------------------------------------------------------ types

export type TeamTarget = {
  effective_from: string;
  weekly_hours: number | string | null;
  weekly_elevation_m: number | null;
};

/** A coach-typed 20-min power target for one rider for one month (period = first of month). */
export type FtpTarget = { period: string; target_w: number };

/** The slice of a ride entry the KPIs read (ride_date comes from the ride). */
export type KpiEntry = {
  athlete_id: string;
  ride_date: string;
  participated: boolean;
  moving_seconds: number | null;
  elevation_m: number | null;
  best_power_20m_w: number | null;
};

export type KpiView = "week" | "month";

export type KpiBucket = {
  /** First day of the week (Monday) or month — also the stable key. */
  key: string;
  label: string;
  hours: number;
  elevation: number;
  power20: number | null;
  /** Targets that applied to THIS bucket; null = none was set. */
  targetHours: number | null;
  targetElevation: number | null;
  /** The 20-min power to beat (month view only): the coach's target for this month if one was set, else the previous month's best. */
  targetPower20: number | null;
  /** True when `targetPower20` is a target a coach typed, false when it is the automatic last-month comparison. */
  targetPower20Set: boolean;
  /** The bucket still has days to go — judged as "in progress", not missed. */
  current: boolean;
};

// ------------------------------------------------------------------ dates

const MONTHS_SHORT = ["Jan", "Shk", "Mar", "Pri", "Maj", "Qer", "Kor", "Gus", "Sht", "Tet", "Nën", "Dhj"];

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(ms: number): string {
  const t = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export function addDays(iso: string, delta: number): string {
  return isoOf(utc(iso) + delta * 86_400_000);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const dow = (new Date(utc(iso)).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

/** First of the month containing `iso`. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(total / 12)}-${p((total % 12) + 1)}-01`;
}

export function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekLabel(start: string): string {
  const [, m, d] = start.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function monthLabelShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

// ------------------------------------------------------------------ targets

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The team target in force on `iso`: the latest row that started on/before it.
 * A team's FIRST target also stands for the weeks before it — a coach who sets
 * their first target today wants to see how the recent weeks measured up, not a
 * chart of unjudged bars. Later changes never rewrite earlier weeks.
 */
export function targetOn(targets: TeamTarget[], iso: string): TeamTarget | null {
  let best: TeamTarget | null = null;
  let earliest: TeamTarget | null = null;
  for (const t of targets) {
    if (!earliest || t.effective_from < earliest.effective_from) earliest = t;
    if (t.effective_from <= iso && (!best || t.effective_from > best.effective_from)) best = t;
  }
  return best ?? earliest;
}

// ------------------------------------------------------------------ series

/**
 * Buckets entries into the last `count` weeks (Monday-started) or months, newest
 * last, each carrying its target. A bucket is judged by the team target in force
 * on its LAST day, so a target saved on a Friday applies to that whole week
 * instead of waiting for the next Monday, while weeks that ended earlier keep
 * the target they had. Months get the weekly target scaled by their length
 * (target x days / 7). A bucket with no entries is a real zero, not "missing".
 */
export function buildSeries(opts: {
  entries: KpiEntry[];
  view: KpiView;
  count: number;
  today: string;
  targets: TeamTarget[];
  /** This rider's 20-min power targets by month (period = first of month); months without one fall back to last month's best. */
  ftpTargets?: FtpTarget[];
}): KpiBucket[] {
  const { entries, view, count, today, targets, ftpTargets = [] } = opts;
  const first = view === "week" ? weekStart(today) : monthStart(today);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(view === "week" ? addDays(first, -7 * i) : addMonths(first, -i));
  }

  // Best 20-min effort of every month, from ALL the entries handed in — a
  // month's target is the month before it, which may sit outside the window.
  const best20 = new Map<string, number>();
  for (const e of entries) {
    if (!e.participated || e.best_power_20m_w == null || !e.ride_date) continue;
    const m = monthStart(e.ride_date);
    if (e.best_power_20m_w > (best20.get(m) ?? 0)) best20.set(m, e.best_power_20m_w);
  }

  const buckets = new Map<string, KpiBucket>();
  for (const key of keys) {
    const days = view === "week" ? 7 : daysInMonth(key);
    const last = view === "week" ? addDays(key, 6) : addDays(addMonths(key, 1), -1);
    const t = targetOn(targets, last);
    const wh = num(t?.weekly_hours);
    const we = num(t?.weekly_elevation_m);
    const typed = view === "month" ? ftpTargets.find((f) => f.period === key)?.target_w ?? null : null;
    buckets.set(key, {
      key,
      label: view === "week" ? weekLabel(key) : monthLabelShort(key),
      hours: 0,
      elevation: 0,
      power20: null,
      targetHours: wh == null ? null : round1((wh * days) / 7),
      targetElevation: we == null ? null : Math.round((we * days) / 7),
      targetPower20: view === "month" ? typed ?? best20.get(addMonths(key, -1)) ?? null : null,
      targetPower20Set: typed != null,
      current: key === first,
    });
  }

  for (const e of entries) {
    if (!e.participated || !e.ride_date) continue;
    const b = buckets.get(view === "week" ? weekStart(e.ride_date) : monthStart(e.ride_date));
    if (!b) continue;
    b.hours += (e.moving_seconds ?? 0) / 3600;
    b.elevation += e.elevation_m ?? 0;
    if (e.best_power_20m_w != null && (b.power20 == null || e.best_power_20m_w > b.power20)) {
      b.power20 = e.best_power_20m_w;
    }
  }

  return keys.map((k) => {
    const b = buckets.get(k)!;
    return { ...b, hours: round1(b.hours), elevation: Math.round(b.elevation) };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------------------ pace
//
// "What is left?" for the period that is still running. Today is passed in (the
// club's calendar day), never read here.

export type PeriodClock = {
  /** Days that have begun, today included: Monday = 1 … Sunday = 7. */
  elapsed: number;
  total: number;
  /** Days still available, today included (Sunday = 1). */
  daysLeft: number;
};

export function periodClock(view: KpiView, today: string): PeriodClock {
  if (view === "week") {
    const elapsed = ((new Date(utc(today)).getUTCDay() + 6) % 7) + 1;
    return { elapsed, total: 7, daysLeft: 7 - elapsed + 1 };
  }
  const total = daysInMonth(monthStart(today));
  const elapsed = Number(today.slice(8, 10));
  return { elapsed, total, daysLeft: total - elapsed + 1 };
}

export type PaceStatus = "hit" | "ontrack" | "behind" | "none";

export type Pace = {
  status: PaceStatus;
  /** How much is still missing to reach the target (0 once reached). */
  remaining: number;
  /** What each remaining day would need to add, today included. */
  perDay: number | null;
  daysLeft: number;
};

/**
 * Reached it, on pace, or behind. The pace line counts only COMPLETED days —
 * a Monday morning with nothing logged is not "behind" — and allows 10% slack.
 */
export function paceOf(value: number, target: number | null, clock: PeriodClock): Pace {
  if (target == null || target <= 0) return { status: "none", remaining: 0, perDay: null, daysLeft: clock.daysLeft };
  if (value >= target) return { status: "hit", remaining: 0, perDay: null, daysLeft: clock.daysLeft };
  const remaining = target - value;
  const expected = (target * (clock.elapsed - 1)) / clock.total;
  return {
    status: value >= expected * 0.9 ? "ontrack" : "behind",
    remaining,
    perDay: remaining / Math.max(1, clock.daysLeft),
    daysLeft: clock.daysLeft,
  };
}

// ------------------------------------------------------------------ misc

/** value / target as a whole percent; null when there is no target to judge by. */
export function pct(value: number | null | undefined, target: number | null | undefined): number | null {
  if (value == null || target == null || target <= 0) return null;
  return Math.round((value / target) * 100);
}

export type TargetParse =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** Raw form text -> number or null (empty). Rejects "8..5", "8h", negatives. */
export function parseTargetField(raw: string, label: string, max: number, integer: boolean): TargetParse {
  const s = (raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  const n = parseStrictNumber(s);
  if (n == null || n < 0) return { ok: false, error: `${label}: numër i pavlefshëm.` };
  if (n > max) return { ok: false, error: `${label}: maksimumi ${max}.` };
  return { ok: true, value: integer ? Math.round(n) : Math.round(n * 100) / 100 };
}
