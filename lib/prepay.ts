// Prepaid invoices ("Parapagim") — the pure half of the feature.
//
// A prepayment is one member paying N consecutive months (1..12) at once. The
// database side is record_prepayment (migration 20260913000001): every month
// becomes an ordinary PAID dues row linked to one dues_prepayments row. This
// module computes the PREVIEW the modal shows while the admin is still
// choosing, and it must reach EXACTLY the verdict record_prepayment reaches —
// same checks, same order, same pricing — so the screen can never promise a
// prepayment the database then refuses, or price a month differently.
//
// Plain module: no "use client", no server-only import. Server Components,
// Server Actions and client components all import VALUES from here.

import {
  coveringMemberships, formatEur, halfOf, isBillable, isReduced, periodLabel, shiftPeriod, toEuros,
  type MembershipLike,
} from "@/lib/finance";
import type { DuesStatus, PaidMethod } from "@/lib/supabase/types";

// ------------------------------------------------------------------ limits

/** Same bound as the CHECK on dues_prepayments.months and the SQL refusal. */
export const PREPAY_MAX_MONTHS = 12;
export const PREPAY_DEFAULT_MONTHS = 3;
/** Every prepaid month must lie within the club's month −12 .. +12. */
export const PREPAY_WINDOW_MONTHS = 12;
/** Cap on the free-text note, so a paste cannot bloat every invoice row. */
export const PREPAY_NOTES_MAX = 500;

export type PrepayMethod = Exclude<PaidMethod, "waived">;
/** Only real money moves — a prepayment is money received, never a waiver. */
export const PREPAY_METHODS: PrepayMethod[] = ["cash", "bank", "online"];

// ------------------------------------------------------------------ inputs

/** One of the member's membership rows (numeric amount may be a string). */
export type PrepayMembership = MembershipLike & {
  amount_eur: number | string | null;
  billable: boolean;
  plan_name: string | null;
};

/** One of the member's existing invoices. */
export type PrepayDue = {
  id: string;
  /** First-of-month, "YYYY-MM-DD". */
  period: string;
  status: DuesStatus;
  amount_eur: number | string | null;
  full_amount_eur: number | string | null;
  invoice_no: string | null;
  plan_name: string | null;
  prepayment_id: string | null;
};

/** A member the modal can pick: one with an ACTIVE billable membership. */
export type PrepayMemberOption = {
  member_id: string;
  full_name: string;
  plan_name: string | null;
  /** The active membership's monthly price, coerced. Always > 0. */
  amount_eur: number;
};

export type PrepayInput = {
  memberId: string;
  /** That member's rows only. */
  memberships: PrepayMembership[];
  dues: PrepayDue[];
  /** First-of-month. */
  firstPeriod: string;
  months: number;
  /** First-of-month periods to bill at half price. */
  halfPeriods?: readonly string[];
  /** "YYYY-MM-DD". */
  paidOn: string;
  method?: string;
  /** The club's day and month, from lib/clubtime — computed on the server. */
  today: string;
  currentPeriod: string;
};

// ------------------------------------------------------------------ output

/**
 *   new          no invoice yet — a PAID one is created
 *   mark_paid    an unpaid/overdue invoice exists — it is marked paid
 *   settled      already paid or waived — BLOCKS the whole prepayment
 *   not_covered  no billable membership in force (amount > 0) — BLOCKS it
 */
export type PrepayMonthState = "new" | "mark_paid" | "settled" | "not_covered";

export type PrepayMonth = {
  period: string;
  label: string;
  state: PrepayMonthState;
  /** What the month costs inside the prepayment. For 'settled' the amount
   * already on the invoice (shown, never added); null for 'not_covered' —
   * there is no price, and that is not €0. */
  amount: number | null;
  /** The undiscounted price when the month ends up reduced; else null. */
  full_amount: number | null;
  /** Reduced in the result: halved now, or already reduced before. */
  reduced: boolean;
  /** Halved BY this prepayment (the toggle is on and it applies). */
  halvedNow: boolean;
  /** Whether the ½ toggle can do anything for this month. */
  halvable: boolean;
  invoice_no: string | null;
  plan_name: string | null;
  /** The existing invoice, for 'mark_paid' and 'settled'. */
  due_id: string | null;
  /** For 'settled': which of the two it is. */
  settled_status: "paid" | "waived" | null;
};

export type PrepayBlockCode =
  | "invalid_months" | "invalid_method" | "invalid_date" | "invalid_period"
  | "future_payment" | "half_outside_range" | "not_covered" | "already_settled";

/** Why the prepayment cannot be saved. `period` names the month for the two
 * per-month codes. */
export type PrepayBlock = { code: PrepayBlockCode; period: string | null };

export type PrepayPreview = {
  firstPeriod: string;
  lastPeriod: string;
  months: PrepayMonth[];
  /** In cents, so a column of halves adds up to exactly what SQL writes. */
  totalCents: number;
  total: number;
  /** The FIRST refusal record_prepayment would raise, or null. */
  blocked: PrepayBlock | null;
  /** "Shtator–Nëntor 2026" / "Dhjetor 2026–Shkurt 2027"; "" when unusable. */
  rangeLabel: string;
};

// ------------------------------------------------------------------ dates

/** A real calendar day as "YYYY-MM-DD" (rejects 2026-02-30). Date.UTC only. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/** A first-of-month period. */
export function isPeriod(value: string): boolean {
  return isIsoDate(value) && value.endsWith("-01");
}

/** The months a prepayment would cover, first to last. */
export function prepayPeriods(firstPeriod: string, months: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < months; i++) out.push(shiftPeriod(firstPeriod, i));
  return out;
}

/** The club month −12 .. +12 every prepaid month must lie in. */
export function prepayWindow(currentPeriod: string): { from: string; to: string } {
  return {
    from: shiftPeriod(currentPeriod, -PREPAY_WINDOW_MONTHS),
    to: shiftPeriod(currentPeriod, PREPAY_WINDOW_MONTHS),
  };
}

/** Every month the "Muaji i parë" picker offers, oldest first. */
export function prepayFirstPeriodChoices(currentPeriod: string): string[] {
  const { from } = prepayWindow(currentPeriod);
  return prepayPeriods(from, PREPAY_WINDOW_MONTHS * 2 + 1);
}

// ------------------------------------------------------------------ labels

/**
 * "Shtator 2026" for one month, "Shtator–Nëntor 2026" inside one year,
 * "Dhjetor 2026–Shkurt 2027" across a year boundary.
 */
export function prepayRangeLabel(firstPeriod: string, months: number): string {
  if (!isPeriod(firstPeriod) || !Number.isInteger(months) || months < 1) return "";
  const first = periodLabel(firstPeriod);
  if (months === 1) return first;
  const last = periodLabel(shiftPeriod(firstPeriod, months - 1));
  const [fm, fy] = first.split(" ");
  const [, ly] = last.split(" ");
  return fy === ly ? `${fm}–${last}` : `${first}–${last}`;
}

/** "muaj" does not inflect for number: "1 muaj", "3 muaj". */
export function monthCount(n: number): string {
  return `${n} muaj`;
}

/** "Gjithsej €120.00 · 3 muaj (Shtator–Nëntor 2026)". */
export function prepaySummary(total: number, months: number, rangeLabel: string): string {
  return `Gjithsej ${formatEur(total)} · ${monthCount(months)}${rangeLabel ? ` (${rangeLabel})` : ""}`;
}

// ------------------------------------------------------------------ preview

/** The membership record_prepayment would price a NEW invoice from. */
function coveringFor(memberships: PrepayMembership[], period: string): PrepayMembership | null {
  return coveringMemberships(memberships, period)[0] ?? null;
}

/**
 * The preview for one member. Checks run in record_prepayment's order and the
 * first failure is `blocked`:
 *   invalid_months → invalid_method → invalid_date → invalid_period (not a
 *   first-of-month, or outside club month ±12) → future_payment →
 *   half_outside_range → per month, in order: already_settled / not_covered.
 * The rows are listed whenever the range itself is readable, so the admin sees
 * WHICH month blocks and why.
 */
export function computePrepayPreview(input: PrepayInput): PrepayPreview {
  const { firstPeriod, months, paidOn, today, currentPeriod } = input;
  const memberships = input.memberships.filter((m) => m.member_id === input.memberId);
  const monthsOk = Number.isInteger(months) && months >= 1 && months <= PREPAY_MAX_MONTHS;
  const firstOk = isPeriod(firstPeriod);
  const lastPeriod = monthsOk && firstOk ? shiftPeriod(firstPeriod, months - 1) : firstPeriod;

  const empty = (code: PrepayBlockCode): PrepayPreview => ({
    firstPeriod, lastPeriod, months: [], totalCents: 0, total: 0,
    blocked: { code, period: null }, rangeLabel: "",
  });
  if (!monthsOk) return empty("invalid_months");

  let blocked: PrepayBlock | null = null;
  const block = (code: PrepayBlockCode, period: string | null = null) => {
    if (!blocked) blocked = { code, period };
  };

  if (input.method !== undefined && !PREPAY_METHODS.some((m) => m === input.method)) block("invalid_method");
  if (!isIsoDate(paidOn)) block("invalid_date");
  if (!firstOk) {
    // Not a readable range at all — nothing to list.
    return { ...empty("invalid_period"), blocked: blocked ?? { code: "invalid_period", period: null } };
  }
  const window = prepayWindow(currentPeriod);
  if (firstPeriod < window.from || lastPeriod > window.to) block("invalid_period");
  if (isIsoDate(paidOn) && paidOn > today) block("future_payment");

  const range = prepayPeriods(firstPeriod, months);
  const inRange = new Set(range);
  const half = new Set(input.halfPeriods ?? []);
  for (const h of half) if (!inRange.has(h)) { block("half_outside_range"); break; }

  const dueByPeriod = new Map(input.dues.map((d) => [d.period, d]));
  let totalCents = 0;
  const rows: PrepayMonth[] = range.map((period) => {
    const wantHalf = half.has(period);
    const due = dueByPeriod.get(period);
    const base = { period, label: periodLabel(period) };

    if (due) {
      const amount = toEuros(due.amount_eur);
      if (due.status === "paid" || due.status === "waived") {
        block("already_settled", period);
        return {
          ...base, state: "settled", amount, full_amount: isReduced(due) ? toEuros(due.full_amount_eur) : null,
          reduced: isReduced(due), halvedNow: false, halvable: false,
          invoice_no: due.invoice_no, plan_name: due.plan_name, due_id: due.id,
          settled_status: due.status,
        };
      }
      // unpaid / overdue → marked paid. Halved only when asked, not already
      // reduced and there is something to halve — set_due_half_price's rules.
      const already = isReduced(due);
      const halvable = !already && amount > 0;
      const halvedNow = wantHalf && halvable;
      const final = halvedNow ? halfOf(amount) : amount;
      totalCents += Math.round(final * 100);
      return {
        ...base, state: "mark_paid", amount: final,
        full_amount: halvedNow ? amount : already ? toEuros(due.full_amount_eur) : null,
        reduced: halvedNow || already, halvedNow, halvable,
        invoice_no: due.invoice_no, plan_name: due.plan_name, due_id: due.id, settled_status: null,
      };
    }

    const cov = coveringFor(memberships, period);
    if (!cov || !isBillable(cov)) {
      block("not_covered", period);
      return {
        ...base, state: "not_covered", amount: null, full_amount: null,
        reduced: false, halvedNow: false, halvable: false,
        invoice_no: null, plan_name: cov?.plan_name ?? null, due_id: null, settled_status: null,
      };
    }
    const price = toEuros(cov.amount_eur);
    const final = wantHalf ? halfOf(price) : price;
    totalCents += Math.round(final * 100);
    return {
      ...base, state: "new", amount: final, full_amount: wantHalf ? price : null,
      reduced: wantHalf, halvedNow: wantHalf, halvable: true,
      invoice_no: null, plan_name: cov.plan_name, due_id: null, settled_status: null,
    };
  });

  return {
    firstPeriod,
    lastPeriod,
    months: rows,
    totalCents,
    total: totalCents / 100,
    blocked,
    rangeLabel: prepayRangeLabel(firstPeriod, months),
  };
}

/**
 * The first month the modal proposes: the club's current month, advanced past
 * consecutive months that are already paid or waived (a member who prepaid
 * until November starts at December). One step further than that: a month
 * with no invoice and no billable membership in force is also skipped WHEN a
 * billable membership starts later — a rider enrolled from next month would
 * otherwise open on a month the prepayment must refuse. Never beyond the
 * window's last month.
 */
export function defaultPrepayFirstPeriod(input: {
  memberId: string;
  memberships: PrepayMembership[];
  dues: PrepayDue[];
  currentPeriod: string;
}): string {
  const memberships = input.memberships.filter((m) => m.member_id === input.memberId);
  const dueByPeriod = new Map(input.dues.map((d) => [d.period, d]));
  const { to } = prepayWindow(input.currentPeriod);
  let p = input.currentPeriod;
  while (p < to) {
    const due = dueByPeriod.get(p);
    if (due) {
      if (due.status === "paid" || due.status === "waived") { p = shiftPeriod(p, 1); continue; }
      return p;
    }
    const cov = coveringFor(memberships, p);
    if (cov && isBillable(cov)) return p;
    const next = shiftPeriod(p, 1);
    const startsLater = memberships.some((m) =>
      m.status !== "paused" && (m.status === "active" || !!m.end_date) && isBillable(m) && m.start_date >= next);
    if (!startsLater) return p;
    p = next;
  }
  return to;
}

// ------------------------------------------------------------------ errors

export type PrepayErrorCode = PrepayBlockCode | "forbidden" | "not_found";

const TOKEN_RE =
  /^(forbidden|not_found|invalid_months|invalid_method|invalid_date|invalid_period|future_payment|half_outside_range|not_covered|already_settled)(?::(\d{4})-(\d{2}))?/;

/**
 * The stable token record_prepayment / undo_prepayment put at the start of the
 * exception message ("already_settled:2026-10" → already_settled, 2026-10-01).
 * Null for anything else — that goes through dbError().
 */
export function parsePrepayError(message: string | null | undefined): { code: PrepayErrorCode; period: string | null } | null {
  const m = TOKEN_RE.exec((message ?? "").trim());
  if (!m) return null;
  return { code: m[1] as PrepayErrorCode, period: m[2] && m[3] ? `${m[2]}-${m[3]}-01` : null };
}

/** One Albanian sentence per refusal. Shared by the modal and the actions. */
export function prepayBlockMessage(block: { code: PrepayErrorCode; period: string | null }, currentPeriod?: string): string {
  const month = block.period ? periodLabel(block.period) : null;
  switch (block.code) {
    case "forbidden":
      return "Nuk ke leje për këtë veprim. Parapagimet i regjistron administratori ose stafi i financave.";
    case "not_found":
      return "Parapagimi nuk u gjet — ndoshta është anuluar tashmë. Rifresko faqen.";
    case "invalid_months":
      return `Numri i muajve duhet të jetë një numër i plotë nga 1 deri në ${PREPAY_MAX_MONTHS}.`;
    case "invalid_method":
      return "Zgjidh një mënyrë pagese: kesh, bankë ose online.";
    case "invalid_date":
      return "Data e pagesës nuk është e vlefshme.";
    case "invalid_period": {
      if (!currentPeriod) return "Muajt e parapagimit nuk janë të vlefshëm. Rifresko faqen dhe provo sërish.";
      const w = prepayWindow(currentPeriod);
      return `Parapagimi mund të përfshijë vetëm muajt nga ${periodLabel(w.from)} deri në ${periodLabel(w.to)}. Ndrysho muajin e parë ose numrin e muajve.`;
    }
    case "future_payment":
      return "Data e pagesës nuk mund të jetë në të ardhmen.";
    case "half_outside_range":
      return "Gjysmë çmimi mund t’u vihet vetëm muajve të këtij parapagimi. Rifresko faqen dhe provo sërish.";
    case "not_covered":
      return month
        ? `Për ${month} anëtari nuk ka anëtarësi me pagesë në fuqi, prandaj ky muaj nuk mund të parapaguhet. Shkurto periudhën ose kontrollo planin te njerëzit.`
        : "Një nga muajt nuk ka anëtarësi me pagesë në fuqi, prandaj nuk mund të parapaguhet.";
    case "already_settled":
      return month
        ? `Fatura për ${month} është tashmë e paguar ose e falur, prandaj parapagimi nuk mund ta përfshijë. Zgjidh një periudhë pa këtë muaj.`
        : "Një nga muajt ka faturë të paguar ose të falur tashmë. Zgjidh një periudhë pa të.";
  }
}
