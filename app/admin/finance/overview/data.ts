import type { createClient } from "@/lib/supabase/server";
import { periodOfTimestamp, type DueLike, type ExpenseLike } from "@/lib/finance";
import type { DuesStatus, ExpensePaidBy, ExpenseStatus } from "@/lib/supabase/types";
import { ALL } from "../filters";

/** The request-scoped Supabase client the pages already build. */
type Client = Awaited<ReturnType<typeof createClient>>;

// dues / club_funds / club_expenses are all admin + staff (migrations 0006 and
// 20260810000002). The whole Pasqyra is read-only and carries the same bar as
// the three ledgers it reads.
export const FINANCE_ROLES = ["admin", "staff"];

export const OVERVIEW_BASE = "/admin/finance/overview";

export type OverviewView = "arka" | "anetaresia" | "borxhet";

/** The window each view filters by: `y` is the Arka year, `p` the Anëtarësia month. */
export type OverviewWindow = { y?: string; p?: string };

/**
 * Every link inside the Pasqyra, built in one place.
 *
 * The two axes are carried across views on purpose. Each view reads only its
 * own — Borxhet reads neither — but on the two pages this merge replaced, the
 * year and the month survived a detour simply because they lived in two
 * separate URLs. Dropping them here would make flipping to another tab and back
 * silently reset the window the user had chosen.
 *
 * "arka" is the default view and is left out of the querystring.
 */
export function overviewHref(view: OverviewView, w: OverviewWindow = {}): string {
  const params = new URLSearchParams();
  if (view !== "arka") params.set("v", view);
  if (w.y) params.set("y", w.y);
  if (w.p) params.set("p", w.p);
  const s = params.toString();
  return s ? `${OVERVIEW_BASE}?${s}` : OVERVIEW_BASE;
}

// Caps. Every one of them is surfaced in the UI when it bites: a total that was
// quietly cut short is not a total. At club scale none are reached.
export const OPEN_DUES_CAP = 5000;
export const OWED_CAP = 500;
export const PAID_DUES_CAP = 5000;

/** One still-open invoice, in the shape every view here needs. */
export type OpenDueRow = DueLike & {
  id: string;
  member_id: string;
  period: string;
  amount_eur: number;
  status: DuesStatus;
  due_date: string | null;
  membership_id: string | null;
};

/**
 * Every unpaid or overdue invoice, ALL periods, written exactly once.
 *
 * Before the merge this read existed three times — on /admin/finance (cap
 * 2000), on the report (cap 5000, filtered) and on the treasury page (cap 5000,
 * unfiltered) — and the treasury page had to promise in Albanian that its
 * figure agreed with the invoice list. Three queries for one quantity is three
 * chances to disagree, so both views of this page now call this helper: same
 * filter, same order, same cap, therefore the same euros.
 *
 * Never windowed by date on purpose: an invoice unpaid since May is still owed
 * in August.
 */
export async function readOpenDues(supabase: Client) {
  const res = await supabase
    .from("dues")
    .select("id, member_id, period, amount_eur, status, due_date, membership_id")
    .in("status", ["unpaid", "overdue"])
    .order("period", { ascending: true })
    .limit(OPEN_DUES_CAP);
  const rows = (res.data as unknown as OpenDueRow[] | null) ?? [];
  return { rows, error: res.error, truncated: rows.length >= OPEN_DUES_CAP };
}

/** One collected membership invoice, in the shape the cash-in figures need. */
export type PaidDueRow = DueLike & {
  id: string;
  amount_eur: number | string | null;
  status: DuesStatus;
  period: string;
  paid_at: string | null;
};

/**
 * MEMBERSHIP CASH-IN, written exactly once.
 *
 * "Hyrjet e klubit" and the Pasqyra both have to print how much academy money
 * came in during a window, and the owner asked for those two numbers to be the
 * same number. So they share this read, `yearOfCash()` below and
 * membershipIncome() from lib/finance — same rows, same bucketing, same helper,
 * therefore the same euros. Deriving it a second time anywhere is how the panel
 * previously ended up with two figures under one word.
 */
export async function readPaidDues(supabase: Client) {
  const res = await supabase
    .from("dues")
    .select("id, amount_eur, status, period, paid_at")
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(PAID_DUES_CAP);
  const rows = (res.data as unknown as PaidDueRow[] | null) ?? [];
  return { rows, error: res.error, truncated: rows.length >= PAID_DUES_CAP };
}

/**
 * The calendar year a PAYMENT landed in, read in local time like every other
 * paid_at bucketing in the panel. Null (a legacy paid invoice with no
 * timestamp) belongs to no year and is reported apart rather than folded into
 * the current one.
 */
export function yearOfPayment(paidAt: string | null | undefined): string | null {
  return periodOfTimestamp(paidAt)?.slice(0, 4) ?? null;
}

/** The collected invoices inside a year window; "all" keeps every row. */
export function paidDuesInYear<T extends { paid_at: string | null }>(rows: T[], year: string): T[] {
  return year === ALL ? rows : rows.filter((d) => yearOfPayment(d.paid_at) === year);
}

/**
 * Paid invoices carrying no payment date. They cannot be placed in a year, so
 * every yearly window drops them — but an ALL-TIME total has no bucket for them
 * to fall out of, and must count them. The rows themselves are returned (not
 * just a count) so a screen can total the euros they carry and show the gap
 * between "the years added up" and "since the club started" as a real figure.
 */
export function undatedPaidRows<T extends { paid_at: string | null }>(rows: T[]): T[] {
  return rows.filter((d) => !yearOfPayment(d.paid_at));
}

/** Paid invoices carrying no payment date — they cannot be placed in a year. */
export function undatedPaidCount(rows: Array<{ paid_at: string | null }>): number {
  return undatedPaidRows(rows).length;
}

/**
 * The sentence that admits them, written once because it appears under a year
 * figure on two screens and the verb has to agree with the count.
 */
export function undatedPaidNote(n: number): string {
  return n === 1
    ? "Një pagesë e shënuar si e paguar nuk ka datë pagese dhe nuk vendoset dot në një vit — nuk është llogaritur këtu."
    : `${n} pagesa të shënuara si të paguara nuk kanë datë pagese dhe nuk vendosen dot në një vit — nuk janë llogaritur këtu.`;
}

/** One club expense somebody fronted and has not been paid back for. */
export type OwedExpenseRow = ExpenseLike & {
  id: string;
  occurred_on: string;
  description: string;
  amount_eur: number | string | null;
  status: ExpenseStatus;
  paid_by: ExpensePaidBy;
  paid_by_member_id: string | null;
  reimbursed: boolean;
  funding_sponsor_id: string | null;
};

/**
 * What the club owes individual people, read the same way /admin/finance/expenses
 * reads it: straight off club_expenses_owed_idx, across ALL years, never derived
 * from a date-windowed expense list. A bill Albioni paid in 2024 is still owed
 * in 2026, and a liability that a cap silently truncates would render as €0.00
 * — "the club owes nobody", a lie told in green.
 */
export async function readOwedExpenses(supabase: Client) {
  const res = await supabase
    .from("club_expenses")
    .select("id, occurred_on, description, amount_eur, status, paid_by, paid_by_member_id, reimbursed, funding_sponsor_id")
    .eq("paid_by", "member")
    .eq("reimbursed", false)
    .order("occurred_on", { ascending: false })
    .limit(OWED_CAP);
  const rows = (res.data as unknown as OwedExpenseRow[] | null) ?? [];
  return { rows, error: res.error, truncated: rows.length >= OWED_CAP };
}

// ---------------------------------------------------------------- word forms

/** "1 faturë" / "3 fatura" — a bare count reads wrong in the singular. */
export function invoiceCount(n: number): string {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

export function expenseCount(n: number): string {
  return `${n} ${n === 1 ? "shpenzim" : "shpenzime"}`;
}

export function paymentCount(n: number): string {
  return `${n} ${n === 1 ? "pagesë" : "pagesa"}`;
}

export function memberCount(n: number): string {
  return `${n} ${n === 1 ? "anëtar" : "anëtarë"}`;
}

export function personCount(n: number): string {
  return `${n} ${n === 1 ? "person" : "persona"}`;
}

/** "hyrje" does not inflect for number in this construction. */
export function fundCount(n: number): string {
  return `${n} hyrje`;
}

/** Nor does "ditë". */
export function dayCount(n: number): string {
  return `${n} ditë`;
}
