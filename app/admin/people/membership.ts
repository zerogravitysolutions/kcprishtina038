// The ANCHOR: everything that follows from a membership's START DATE.
//
// WHY THIS FILE EXISTS. A membership start date is not a label — it is the day
// of the month the club bills on, forever. migration 20260818000001
// (generate_dues_anchored_for_date) runs daily and cuts an invoice for every
// active, billable membership whose ANCHOR DAY equals today:
//
//     anchor day = least(day(start_date), days_in_month(this month))
//     period     = first of that month        (the unique(member_id, period) bucket)
//     issued_on  = the anchor date itself
//     due_date   = issued_on + 5
//
// UNLESS the member already has ANY dues row for that period (not only one on
// this membership — the NOT EXISTS is keyed on member_id + period). It runs at
// 03:20 UTC on the database's day, and it never looks backwards: a month whose
// anchor date has already passed is NOT retro-created, it has to be generated
// by hand from /admin/finance.
//
// Two screens write that date — the enrolment form in /admin/applications and
// the membership panel on /admin/people — and both must tell the admin what
// they are about to cause BEFORE they press the button. So the arithmetic lives
// here, once: no "use client", no server-only import, so a Server Component, a
// client component and a Server Action all compute the identical answer. A
// second copy of these rules is how a form starts promising a date the database
// will not honour.
//
// All dates are "YYYY-MM-DD" and are handled as STRINGS with integer arithmetic
// — never `new Date("2026-08-18")`, which is parsed as UTC and shifts the day
// backwards west of Greenwich (the same bug lib/finance.ts documents).

import { DUES_STATUS_LABEL, formatDate, formatEur, hasAmount, periodLabel } from "@/lib/finance";

// ------------------------------------------------------------------ parsing

export type YMD = { year: number; month: number; day: number };

/** Days in a 1-indexed month. Handles February in a leap year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "2026-08-18" → {2026, 8, 18}. Null for anything that is not a REAL calendar
 * date: the shape is checked AND the day is checked against the month's length,
 * so "2026-02-31" and "2026-13-01" are rejected here rather than by Postgres.
 */
export function parseDate(value: string | null | undefined): YMD | null {
  const m = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** True when the value is a real "YYYY-MM-DD" calendar date. */
export function isDateOnly(value: string | null | undefined): boolean {
  return parseDate(value) !== null;
}

// There is deliberately NO "today" helper here. The club's day comes from
// clubTodayISO() and the cron's progress from lastBillingRunDay() (lib/clubtime),
// both computed on the SERVER and handed to these functions as arguments: a
// client component that read its own clock in render would disagree with the
// server render around midnight, and a server that read `new Date()` in UTC
// would default a Kosovo admin's start date — the member's billing day — to
// yesterday.

/**
 * "2026-08-18" → "2026-08-01".
 *
 * THIS IS THE INVOICE BUCKET, NOT THE MEMBERSHIP START. dues.period is
 * first-of-month by construction — unique(member_id, period) is the only thing
 * standing between a member and two invoices for one month, and every generator
 * writes date_trunc('month', …). A start DATE must never be flattened this way;
 * that is the bug this whole feature exists to undo.
 */
export function monthStartOf(value: string | null | undefined): string | null {
  const d = parseDate(value);
  if (!d) {
    // "2026-08" (a month input) is still a legitimate period.
    const m = (value ?? "").trim().match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return iso(Number(m[1]), month, 1);
  }
  return iso(d.year, d.month, 1);
}

/** Calendar arithmetic through UTC, so no timezone can move the day. */
export function addDays(value: string, delta: number): string | null {
  const d = parseDate(value);
  if (!d) return null;
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + delta));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ------------------------------------------------------------------ anchoring

/** The day of the month the club bills this member on. Null when unparseable. */
export function anchorDay(startDate: string | null | undefined): number | null {
  return parseDate(startDate)?.day ?? null;
}

/**
 * The anchor's date inside one month, CLAMPED to that month's length — a 31st
 * anchor falls on 30 September and on 28/29 February, exactly as
 * least(day(start_date), v_dim) does in SQL.
 */
export function anchorDateIn(year: number, month: number, day: number): string {
  return iso(year, month, Math.min(day, daysInMonth(year, month)));
}

/** Bounded walks: 20 years of months, so a typo can never hang a render. */
const MAX_MONTHS = 240;

/** The first-of-month periods a member already has a dues row for. */
function periodSet(invoicedPeriods: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of invoicedPeriods) {
    const m = monthStartOf(p);
    if (m) out.add(m);
  }
  return out;
}

/**
 * The next date the daily job will ACTUALLY cut an invoice on — the same three
 * filters as generate_dues_anchored_for_date, applied to the calendar:
 *
 *   • strictly AFTER `lastRunDay` (lastBillingRunDay(), computed on the
 *     server): that day's 03:20 UTC run is over, so its anchors cannot fire any
 *     more; the day after it is the first run still to come. Assuming "today's
 *     run already happened" was wrong for half the night.
 *   • on or after the start date (m.start_date <= p_on) and, when given, on or
 *     before the end date (m.end_date >= p_on);
 *   • in a month the member has NO dues row for yet — the job's NOT EXISTS.
 *     An invoice generated by hand (or the enrolment's first invoice) means the
 *     job skips that month, so this does too instead of naming a date on which
 *     nothing will be billed.
 */
export function nextAnchoredInvoice(
  startDate: string,
  lastRunDay: string,
  invoicedPeriods: Iterable<string> = [],
  endDate: string | null = null,
): string | null {
  const start = parseDate(startDate);
  if (!start || !parseDate(lastRunDay)) return null;
  const afterRun = addDays(lastRunDay, 1);
  if (!afterRun) return null;
  const from = startDate > afterRun ? startDate : afterRun;
  const f = parseDate(from);
  if (!f) return null;
  const invoiced = periodSet(invoicedPeriods);

  let year = f.year;
  let month = f.month;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const candidate = anchorDateIn(year, month, start.day);
    if (endDate && candidate > endDate) return null;
    if (candidate >= from && !invoiced.has(iso(year, month, 1))) return candidate;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return null;
}

/**
 * Everything a start date implies, computed once for both forms.
 *
 * `missedMonths` counts the anchor dates in [start, lastRunDay] whose month has
 * no dues row — the months the club would have billed had the membership
 * existed then, and that the job will never go back for. They are NOT created
 * by anything; the admin generates them from /admin/finance. Saying "3" is what
 * stops a backdated enrolment from quietly losing three months of dues. A month
 * that already carries an invoice is not missed and is not counted.
 */
export type StartOutlook = {
  startDate: string;
  anchorDay: number;
  /** The date the daily job next fires for this member. Null when it never
   * will (only possible with an end date, or 20 years already invoiced). */
  nextInvoice: string | null;
  /** nextInvoice + 5, the same rule the trigger applies. */
  nextDue: string | null;
  /** The month `nextInvoice` bills, first-of-month. */
  nextPeriod: string | null;
  /** The start is earlier than the club's today. */
  backdated: boolean;
  /** Anchor dates already processed that nothing will create automatically. */
  missedMonths: number;
  /** The first of those months, first-of-month. Null when there are none. */
  firstMissedPeriod: string | null;
  /** Some month from the start on already has an invoice, so the next
   * automatic one is not the member's first. */
  alreadyInvoiced: boolean;
};

export function startOutlook(
  startDate: string,
  today: string,
  lastRunDay: string,
  invoicedPeriods: Iterable<string> = [],
): StartOutlook | null {
  const start = parseDate(startDate);
  if (!start || !parseDate(today) || !parseDate(lastRunDay)) return null;
  const invoiced = periodSet(invoicedPeriods);
  const nextInvoice = nextAnchoredInvoice(startDate, lastRunDay, invoiced);
  const nextDue = nextInvoice ? addDays(nextInvoice, 5) : null;
  const nextPeriod = nextInvoice ? monthStartOf(nextInvoice) : null;

  // Walk the anchor dates from the start month through the last processed day.
  let missedMonths = 0;
  let firstMissedPeriod: string | null = null;
  let year = start.year;
  let month = start.month;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const candidate = anchorDateIn(year, month, start.day);
    if (candidate > lastRunDay) break;
    const period = iso(year, month, 1);
    if (candidate >= startDate && !invoiced.has(period)) {
      missedMonths += 1;
      if (!firstMissedPeriod) firstMissedPeriod = period;
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  const startPeriod = iso(start.year, start.month, 1);
  let alreadyInvoiced = false;
  for (const p of invoiced) if (p >= startPeriod) { alreadyInvoiced = true; break; }

  return {
    startDate,
    anchorDay: start.day,
    nextInvoice,
    nextDue,
    nextPeriod,
    backdated: startDate < today,
    missedMonths,
    firstMissedPeriod,
    alreadyInvoiced,
  };
}

// ------------------------------------------------------------------ plan changes

/**
 * Which of set_member_plan()'s four cases a request takes — the EXACT
 * conditions of migration 20260808000002 section E, in the same order:
 *   insert  — no active membership.                                  (case 1)
 *   same    — plan, amount, billable and start all equal.            (case 2)
 *   correct — the row has NO dues AND does not start before the new
 *             start: updated in place.                               (case 3)
 *   reopen  — anything else: the row is CLOSED and a new one opened. (case 4)
 *
 * The server action runs this on rows it has just read and refuses a "reopen"
 * that was not explicitly confirmed; the panel runs it on the page snapshot,
 * only to warn early. `amount` must already be what SQL will store: 0 on a
 * non-billable tier, rounded to cents.
 */
export type PlanCase = "insert" | "same" | "correct" | "reopen";

export function planChangeCase(
  current: { plan_id: string; amount_eur: number | string | null; billable: boolean; start_date: string } | null,
  hasInvoices: boolean,
  next: { planId: string; amount: number; billable: boolean; startDate: string },
): PlanCase {
  if (!current) return "insert";
  if (
    current.plan_id === next.planId &&
    sameAmount(current.amount_eur, next.amount) &&
    current.billable === next.billable &&
    current.start_date === next.startDate
  ) return "same";
  if (!hasInvoices && current.start_date >= next.startDate) return "correct";
  return "reopen";
}

/**
 * WHY a change closes the current period — the real cause, in Albanian, for
 * the case-4 warning. SQL takes case 4 when the row has dues OR starts before
 * the new start; the sentence names whichever is true (both, if both are).
 */
export function reopenReason(currentStart: string, hasInvoices: boolean, newStart: string): string {
  const reasons: string[] = [];
  if (hasInvoices) {
    reasons.push("anëtarësia e tanishme ka tashmë fatura të lëshuara, dhe ato duhet të mbeten me planin dhe çmimin me të cilin u lëshuan");
  }
  if (currentStart < newStart) {
    const dayBefore = addDays(newStart, -1);
    reasons.push(
      `data e re e fillimit (${formatDate(newStart)}) është pas fillimit të tanishëm (${formatDate(currentStart)}), ` +
        `prandaj ditët nga ${formatDate(currentStart)} deri më ${formatDate(dayBefore)} mbeten me periudhën e tanishme`,
    );
  }
  return reasons.join("; dhe ");
}

/**
 * The last day the CURRENT row covers after a close-and-open: SQL case 4's
 * v_end = greatest(p_start - 1, start_date), string for string.
 */
export function reopenEndOf(currentStart: string, newStart: string): string {
  const dayBefore = addDays(newStart, -1) ?? newStart;
  return dayBefore > currentStart ? dayBefore : currentStart;
}

/**
 * Invoiced months (first-of-month) that begin AFTER `lastCoveredDay` — the
 * invoices a closed window leaves behind. An early-billed next month is the
 * everyday case: it keeps its unique(member_id, period) slot, so nothing
 * re-bills that month under the plan that now covers it (or at all, once the
 * member has left), and an unpaid one keeps reading as debt.
 */
export function periodsAfter(invoicedPeriods: Iterable<string>, lastCoveredDay: string): string[] {
  return [...periodSet(invoicedPeriods)].filter((p) => p > lastCoveredDay).sort();
}

/**
 * The months a close-and-open costs in AUTOMATIC billing. Case 4 writes status
 * 'ended' AT ONCE, even when the new start is in the future, and the anchored
 * job bills status = 'active' only. So every anchor of the current row that
 * the job has not reached yet (> lastRunDay) and that falls in a month BEFORE
 * the new start's month is never cut — the new row bills from its own start
 * month on. The same trap latestEndDate() refuses on the end path, reached
 * here through a plan change. Empty when the current row is not billed at all.
 */
export function monthsLostOnReopen(
  current: { start_date: string; billable: boolean; amount_eur: number | string | null },
  newStart: string,
  lastRunDay: string,
  invoicedPeriods: Iterable<string> = [],
): string[] {
  if (!willBeInvoiced(current)) return [];
  const s = parseDate(current.start_date);
  const n = parseDate(newStart);
  const r = parseDate(lastRunDay);
  if (!s || !n || !r) return [];
  const newMonth = iso(n.year, n.month, 1);
  const invoiced = periodSet(invoicedPeriods);
  // From whichever is later, the row's first month or the job's current one.
  const from = current.start_date > lastRunDay ? s : r;
  const out: string[] = [];
  let year = from.year;
  let month = from.month;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const period = iso(year, month, 1);
    if (period >= newMonth) break;
    const candidate = anchorDateIn(year, month, s.day);
    if (candidate >= current.start_date && candidate > lastRunDay && !invoiced.has(period)) out.push(period);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return out;
}

/** Albanian: the months monthsLostOnReopen() found. Empty string for none. */
export function lostMonthsSentence(periods: string[]): string {
  if (periods.length === 0) return "";
  const labels = periods.map(periodLabel).join(", ");
  return periods.length === 1
    ? `${labels} nuk faturohet automatikisht: anëtarësia e tanishme mbyllet menjëherë, para ditës së saj të faturimit. Gjeneroje me dorë te Financat.`
    : `${labels} nuk faturohen automatikisht: anëtarësia e tanishme mbyllet menjëherë, para ditëve të saj të faturimit. Gjeneroji me dorë te Financat.`;
}

/** An invoice as the warnings name it. The panel knows only the period; the
 * server action adds the number, the amount and the status. */
export type NamedInvoice = {
  period: string;
  invoice_no?: string | null;
  amount_eur?: number | string | null;
  status?: string | null;
};

function invoiceItem(d: NamedInvoice): string {
  const parts: string[] = [];
  if (d.invoice_no) parts.push(d.invoice_no);
  if (d.amount_eur !== undefined) {
    parts.push(hasAmount({ amount_eur: d.amount_eur }) ? formatEur(d.amount_eur) : "Pa shumë");
  }
  const status = d.status ? DUES_STATUS_LABEL[d.status as keyof typeof DUES_STATUS_LABEL] : null;
  if (status) parts.push(status.toLowerCase());
  const label = periodLabel(monthStartOf(d.period) ?? d.period);
  return parts.length ? `${label} (${parts.join(", ")})` : label;
}

/** Albanian: invoices an END leaves behind for months it no longer covers. */
export function laterInvoicesOnEnd(list: NamedInvoice[]): string {
  if (list.length === 0) return "";
  const items = list.map(invoiceItem).join("; ");
  return list.length === 1
    ? `Mbetet një faturë për një muaj që anëtarësia nuk e mbulon më: ${items}. Ajo nuk fshihet dhe nuk falet vetvetiu — nëse është e papaguar, mbetet borxh. Fshije ose fale te Financat, nëse nuk duhet.`
    : `Mbeten ${list.length} fatura për muaj që anëtarësia nuk i mbulon më: ${items}. Ato nuk fshihen dhe nuk falen vetvetiu — të papaguarat mbeten borxh. Fshiji ose fali te Financat, nëse nuk duhen.`;
}

/** Albanian: invoices of the current row that fall inside the NEW period. */
export function laterInvoicesOnReopen(list: NamedInvoice[]): string {
  if (list.length === 0) return "";
  const items = list.map(invoiceItem).join("; ");
  return list.length === 1
    ? `Një faturë e lëshuar tashmë bie brenda periudhës së re: ${items}. Ajo mbetet me planin dhe çmimin e vjetër, dhe faturimi automatik nuk e faturon atë muaj me planin e ri. Nëse duhet me çmimin e ri, fshije ose fale te Financat dhe gjeneroje sërish.`
    : `${list.length} fatura të lëshuara tashmë bien brenda periudhës së re: ${items}. Ato mbeten me planin dhe çmimin e vjetër, dhe faturimi automatik nuk i faturon ata muaj me planin e ri. Nëse duhen me çmimin e ri, fshiji ose fali te Financat dhe gjeneroji sërish.`;
}

// ------------------------------------------------------------------ validation
//
// Both screens validate with THESE functions and the server actions validate
// with them again — the client copy is the message, the server copy is the
// guard (React masks whatever a Server Action throws in production).

/** How far a start date may reasonably sit from today, in years. */
const MAX_YEARS_BACK = 20;
const MAX_YEARS_AHEAD = 2;

/**
 * Albanian complaint about a membership start date, or null when it is fine.
 * `today` is the CLUB's day (clubTodayISO), passed in by the caller.
 */
export function startDateError(value: string | null | undefined, today: string): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return "Zgjidh datën e fillimit të anëtarësisë.";
  if (!isDateOnly(raw)) return "Data e fillimit nuk është datë e vlefshme. Përdor formatin vit-muaj-ditë, p.sh. 2026-08-18.";
  const t = parseDate(today);
  if (!t) return null;
  const min = iso(t.year - MAX_YEARS_BACK, 1, 1);
  const max = iso(t.year + MAX_YEARS_AHEAD, 12, 31);
  if (raw < min) return `Data e fillimit është shumë larg në të kaluarën. Zgjidh një datë pas ${formatDate(min)}.`;
  if (raw > max) return `Data e fillimit është shumë larg në të ardhmen. Zgjidh një datë para ${formatDate(max)}.`;
  return null;
}

/**
 * The latest day a membership may be ENDED on: the club's today — or its start
 * date, when it has not started yet (the table's check wants end >= start).
 *
 * WHY NOT THE FUTURE. Ending writes status 'ended' at once, and the anchored
 * job bills status = 'active' only, so a future end date would silently cancel
 * every automatic invoice between now and that date while the screen promised
 * them. An end date is therefore always a fact, never a schedule.
 *
 * A membership that has not started and carries no invoice is not ENDED at
 * all — endPersonMembership removes it, so it covers no month (an 'ended' row
 * would still cover its start month for manual and early generation). The
 * start date here only matters when such a row already has an invoice.
 */
export function latestEndDate(startDate: string, today: string): string {
  return isDateOnly(startDate) && startDate > today ? startDate : today;
}

/**
 * The day after which an END leaves an invoice uncovered: the end date itself
 * — except for a membership that had not started yet, which served no day, so
 * every invoice from its start month on is left behind.
 */
export function endCutoff(startDate: string, endDate: string, today: string): string {
  if (isDateOnly(startDate) && startDate > today) {
    const first = monthStartOf(startDate);
    const before = first ? addDays(first, -1) : null;
    if (before) return before;
  }
  return endDate;
}

/**
 * Albanian complaint about a membership END date, or null.
 *
 * memberships carries `check (end_date is null or end_date >= start_date)`, so
 * an end before the start is refused by Postgres with text nobody can act on.
 * It is refused here instead, naming the start date. An end after
 * latestEndDate() is refused for the reason given there.
 */
export function endDateError(
  value: string | null | undefined,
  startDate: string,
  today: string,
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return "Zgjidh datën e përfundimit të anëtarësisë.";
  if (!isDateOnly(raw)) return "Data e përfundimit nuk është datë e vlefshme. Përdor formatin vit-muaj-ditë, p.sh. 2026-08-31.";
  if (isDateOnly(startDate) && raw < startDate) {
    return `Anëtarësia ka filluar më ${formatDate(startDate)}, prandaj nuk përfundon më herët. Zgjidh një datë nga ${formatDate(startDate)} e tutje.`;
  }
  if (isDateOnly(today)) {
    const max = latestEndDate(startDate, today);
    if (raw > max) {
      return max === today
        ? "Data e përfundimit nuk mund të jetë në të ardhmen: faturat automatike ndalen menjëherë. Zgjidh sot ose një datë më të hershme."
        : `Anëtarësia ende nuk ka filluar, prandaj përfundon në ditën e fillimit, ${formatDate(max)}.`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ labels

/** The shape both the panel and the page need from a memberships row. */
export type MembershipLike = {
  billable: boolean;
  amount_eur: number | string | null;
};

/**
 * The monthly amount, in words.
 *
 * A Garues is NOT "€0.00": they are structurally outside billing, so the amount
 * is not a number at all. A billable tier at 0 IS a number — a waiver the club
 * granted — and says so. A missing amount is neither; it is unknown, and reads
 * "Pa shumë" like every other nullable amount in the panel.
 */
export function membershipAmountLabel(row: MembershipLike): string {
  if (!row.billable) return "Pa pagesë";
  if (!hasAmount(row)) return "Pa shumë";
  const n = Number(row.amount_eur);
  if (n === 0) return "€0.00 · e falur";
  return `${formatEur(row.amount_eur)} / muaj`;
}

/** Does this membership produce automatic invoices at all? */
export function willBeInvoiced(row: MembershipLike): boolean {
  return row.billable && hasAmount(row) && Number(row.amount_eur) > 0;
}

/** Two amounts are the same money at the precision the column stores (2dp). */
export function sameAmount(a: number | string | null, b: number | string | null): boolean {
  return Math.round(Number(a ?? 0) * 100) === Math.round(Number(b ?? 0) * 100);
}
