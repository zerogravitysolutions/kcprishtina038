// Pure helpers for the academy finance feature (membership plans, memberships
// and the monthly invoices stored in `dues`). No server or client deps — safe
// to import from server components, client components and server actions.
//
// The one rule worth knowing: dues.status is what a human last wrote, it is NOT
// kept fresh by anything. An unpaid invoice whose due_date has passed still
// says 'unpaid' in the database. Every screen must therefore render
// effectiveStatus(), which derives 'overdue' from the date, so the UI is
// truthful without a nightly job rewriting rows.

import type { DuesStatus, MembershipStatus, PaidMethod } from "@/lib/supabase/types";
import { monthLabel } from "@/lib/training";

// ------------------------------------------------------------------ types

/** The subset of a dues row every helper here needs. */
export type DueLike = {
  status: DuesStatus;
  /** First of the billed month, "YYYY-MM-DD". */
  period: string;
  /** When payment is expected. Null on rows created before invoicing existed. */
  due_date?: string | null;
  amount_eur?: number | string | null;
  paid_at?: string | null;
};

/** The subset of a membership_plans / memberships row the money helpers need. */
export type BillableLike = {
  billable: boolean;
  amount_eur?: number | string | null;
};

/**
 * How a plan or a membership relates to money. The distinction matters for
 * reporting, because two very different riders both end up with no invoice:
 *   "billed"        — a paying tier with a price.
 *   "waived"        — a paying tier set to 0 for this rider (e.g. under 14).
 *   "non_billable"  — a racer. Outside billing entirely; never invoiced.
 */
export type BillingMode = "billed" | "waived" | "non_billable";

/** What the UI actually shows — 'overdue' is derived, never trusted from the DB. */
export type EffectiveDuesStatus = "paid" | "waived" | "overdue" | "unpaid";

/** Debt ageing buckets for the reporting panel. Null when nothing is overdue. */
export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

// ------------------------------------------------------------------ labels

export const DUES_STATUS_LABEL: Record<DuesStatus, string> = {
  paid: "Paguar",
  unpaid: "Papaguar",
  overdue: "Në vonesë",
  waived: "E falur",
};

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveDuesStatus, string> = {
  paid: "Paguar",
  unpaid: "Papaguar",
  overdue: "Në vonesë",
  waived: "E falur",
};

/** Maps onto the .badge-st modifiers in app/admin/admin.css. */
export const EFFECTIVE_STATUS_TONE: Record<EffectiveDuesStatus, "ok" | "warn" | "err"> = {
  paid: "ok",
  waived: "ok",
  unpaid: "warn",
  overdue: "err",
};

export const PAID_METHOD_LABEL: Record<PaidMethod, string> = {
  cash: "Kesh",
  bank: "Bankë",
  online: "Online",
  waived: "E falur",
};

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  active: "Aktive",
  paused: "E pezulluar",
  ended: "E mbyllur",
};

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  billed: "Me pagesë",
  waived: "E falur",
  non_billable: "Nuk faturohet",
};

// ------------------------------------------------------------------ money

/** 40 → "€40.00". Null/NaN render as "€0.00"; use planAmountLabel for plans. */
export function formatEur(n: number | string | null | undefined): string {
  return `€${toNumber(n).toFixed(2)}`;
}

/** Coerces the numeric-as-string Supabase sends back. Null/NaN → 0. */
function toNumber(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Whether this plan or membership produces invoices at all. A non-billable row
 * is never billed regardless of amount_eur, and a 0 amount produces nothing to
 * collect — but the two are NOT the same thing, hence billingMode().
 */
export function isBillable(row: BillableLike): boolean {
  return row.billable && toNumber(row.amount_eur) > 0;
}

export function billingMode(row: BillableLike): BillingMode {
  if (!row.billable) return "non_billable";
  return toNumber(row.amount_eur) > 0 ? "billed" : "waived";
}

/**
 * A plan's or membership's monthly price, as shown on /join and in the admin
 * panel. A non-billable tier has no price — it is not "€0" and not a price on
 * request, so it must never be rendered as an amount.
 */
export function planAmountLabel(row: BillableLike): string {
  if (!row.billable) return "Pa pagesë mujore";
  // A billable plan with no price is a half-configured row, not a free one —
  // saying "€0.00" would read as "this tier costs nothing".
  if (row.amount_eur === null || row.amount_eur === undefined || row.amount_eur === "") {
    return "Çmimi nuk është caktuar";
  }
  return `${formatEur(row.amount_eur)} / muaj`;
}

/** Sums amount_eur across rows, coercing the numeric-as-string case. */
export function sumEur(rows: Array<{ amount_eur?: number | string | null }>): number {
  return rows.reduce((total, r) => total + toNumber(r.amount_eur), 0);
}

// ------------------------------------------------------------------ periods

/**
 * Parses a "YYYY-MM-DD" date column into a LOCAL midnight Date. new Date(str)
 * would read it as UTC and shift the day backwards west of Greenwich, which
 * made invoices look a day late.
 */
function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "2026-08-01" → "Gusht 2026". Month names come from lib/training. */
export function periodLabel(period: string): string {
  const d = parseDateOnly(period);
  if (!d) return period;
  return monthLabel(d.getFullYear(), d.getMonth());
}

/** "2026-08-01" → "1.8.2026", the Albanian short date. */
export function formatDate(value: string | null | undefined): string {
  const d = parseDateOnly(value);
  if (!d) return "—";
  return d.toLocaleDateString("sq");
}

/** First of the current month as a "YYYY-MM-DD" period value. */
export function currentPeriod(): string {
  const now = new Date();
  return periodOf(now.getFullYear(), now.getMonth());
}

/** (2026, 7) → "2026-08-01". month0 is 0-indexed, like Date. */
export function periodOf(year: number, month0: number): string {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** shiftPeriod("2026-08-01", -1) → "2026-07-01". */
export function shiftPeriod(period: string, delta: number): string {
  const d = parseDateOnly(period);
  if (!d) return period;
  return periodOf(d.getFullYear(), d.getMonth() + delta);
}

/** "2026-08-01" → "2026-08", for URL params. */
export function periodParam(period: string): string {
  return period.slice(0, 7);
}

/** Parses a "YYYY-MM" URL param back to a period, falling back to this month. */
export function parsePeriodParam(param: string | null | undefined): string {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return currentPeriod();
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return currentPeriod();
  return periodOf(Number(m[1]), month0);
}

// ------------------------------------------------------------------ status

/**
 * Falls back to period + 14 days for legacy rows created before due_date
 * existed — the same offset generate_dues_for_period() uses.
 */
export function dueDateOf(due: DueLike): Date | null {
  const explicit = parseDateOnly(due.due_date);
  if (explicit) return explicit;
  const period = parseDateOnly(due.period);
  if (!period) return null;
  return new Date(period.getFullYear(), period.getMonth(), period.getDate() + 14);
}

/**
 * The status to display. 'overdue' is derived from the due date, never read
 * from dues.status, so an invoice that quietly went past due still shows red.
 */
export function effectiveStatus(due: DueLike): EffectiveDuesStatus {
  if (due.status === "paid") return "paid";
  if (due.status === "waived") return "waived";
  const dueDate = dueDateOf(due);
  if (dueDate && dueDate.getTime() < startOfToday().getTime()) return "overdue";
  return "unpaid";
}

/** Whole days past the due date. 0 when paid, waived or not yet due. */
export function daysOverdue(due: DueLike): number {
  if (effectiveStatus(due) !== "overdue") return 0;
  const dueDate = dueDateOf(due);
  if (!dueDate) return 0;
  const ms = startOfToday().getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Debt ageing bucket for the reporting panel. Null when not overdue. */
export function agingBucket(due: DueLike): AgingBucket | null {
  const days = daysOverdue(due);
  if (days <= 0) return null;
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Bucket order + Albanian labels, so every report lists them the same way. */
export const AGING_BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-30": "1–30 ditë",
  "31-60": "31–60 ditë",
  "61-90": "61–90 ditë",
  "90+": "mbi 90 ditë",
};

/** True when the invoice still owes money (unpaid or overdue). */
export function isOutstanding(due: DueLike): boolean {
  const s = effectiveStatus(due);
  return s === "unpaid" || s === "overdue";
}

/** Total still owed across a set of invoices. */
export function outstandingTotal(dues: DueLike[]): number {
  return sumEur(dues.filter(isOutstanding));
}
