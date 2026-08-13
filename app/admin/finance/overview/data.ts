import type { createClient } from "@/lib/supabase/server";
import type { DueLike, ExpenseLike } from "@/lib/finance";
import type { DuesStatus, ExpensePaidBy, ExpenseStatus } from "@/lib/supabase/types";

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
