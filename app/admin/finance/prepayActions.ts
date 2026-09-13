"use server";

// Prepaid invoices ("Parapagim") — the server actions. The work itself is done
// by record_prepayment / undo_prepayment (migration 20260913000001), which
// lock, validate and write atomically. These actions gate the caller (status
// re-read on every call — a Server Action is a standalone POST endpoint),
// reject a malformed request early, and turn every SQL refusal token into an
// Albanian sentence. Nothing is thrown to the client: React masks thrown
// Server Action errors in production.

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { clubCurrentPeriod, clubTodayISO } from "@/lib/clubtime";
import { DISCOUNT_REASON_MAX, HALF_PRICE_DEFAULT_REASON, toEuros } from "@/lib/finance";
import {
  PREPAY_DEFAULT_MONTHS, PREPAY_MAX_MONTHS, PREPAY_METHODS, PREPAY_NOTES_MAX,
  computePrepayPreview, defaultPrepayFirstPeriod, isIsoDate, isPeriod, parsePrepayError,
  prepayBlockMessage, prepayPeriods, prepayRangeLabel, prepayWindow,
  type PrepayDue, type PrepayMembership, type PrepayPreview,
} from "@/lib/prepay";
import type { DuesStatus, MembershipStatus } from "@/lib/supabase/types";
import { requireAdmin } from "../guards";

const FINANCE_ROLES = ["admin", "staff"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FinanceGate = { ok: true; id: string; role: string } | { ok: false; error: string };

/** admin + staff, ACTIVE — the same bar as assertFinanceStaff, as a result. */
async function financeGate(): Promise<FinanceGate> {
  const p = await getProfile();
  if (!p) return { ok: false, error: "Nuk je i kyçur." };
  if (p.status !== "active") return { ok: false, error: "Llogaria jote nuk është aktive." };
  if (!FINANCE_ROLES.includes(p.role)) {
    return { ok: false, error: prepayBlockMessage({ code: "forbidden", period: null }) };
  }
  return { ok: true, id: p.id, role: p.role };
}

/** Everything that shows a member's invoices or the club's money. */
function revalidatePrepay() {
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/overview");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/people");
  revalidatePath("/portal", "layout");
  revalidatePath("/invoice/[id]", "page");
  revalidatePath("/invoice/prepay/[id]", "page");
}

// ------------------------------------------------------------------ preview

/** One member's rows, as the pure preview needs them, plus the default. */
export type PrepayContext = {
  member_id: string;
  full_name: string;
  memberships: PrepayMembership[];
  dues: PrepayDue[];
  defaultFirstPeriod: string;
  /** Computed for the options given (or the defaults). The modal recomputes it
   * live from `memberships` + `dues` with the same pure function. */
  preview: PrepayPreview;
};

export type PrepayContextResult = { ok: true; data: PrepayContext } | { ok: false; error: string };

type MembershipRead = {
  id: string; member_id: string; status: MembershipStatus;
  start_date: string; end_date: string | null;
  amount_eur: number | string | null; billable: boolean;
  plan: { name_sq: string } | null;
};

type DueRead = {
  id: string; period: string; status: DuesStatus;
  amount_eur: number | string | null; full_amount_eur: number | string | null;
  invoice_no: string | null; prepayment_id: string | null;
  membership: { plan: { name_sq: string } | null } | null;
};

/**
 * Reads ONE member's memberships and invoices on the caller's session (RLS:
 * admin + staff) and returns them with the preview. A failed read is an error,
 * never an empty list — "no invoices" would turn every month into "E re".
 */
export async function prepaymentPreview(
  memberId: string,
  opts: { firstPeriod?: string; months?: number; halfPeriods?: string[]; paidOn?: string; method?: string } = {},
): Promise<PrepayContextResult> {
  try {
    const gate = await financeGate();
    if (!gate.ok) return gate;

    const id = (memberId || "").trim();
    if (!UUID_RE.test(id)) return { ok: false, error: "Zgjidh një anëtar." };

    const supabase = await createClient();
    const [profileRes, memRes, duesRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", id).maybeSingle(),
      supabase
        .from("memberships")
        .select("id, member_id, status, start_date, end_date, amount_eur, billable, plan:membership_plans!plan_id(name_sq)")
        .eq("member_id", id)
        .order("start_date", { ascending: false })
        .limit(200),
      // One row a month per member: 1000 is eighty years.
      supabase
        .from("dues")
        .select("id, period, status, amount_eur, full_amount_eur, invoice_no, prepayment_id, membership:memberships!membership_id(plan:membership_plans!plan_id(name_sq))")
        .eq("member_id", id)
        .order("period", { ascending: true })
        .limit(1000),
    ]);
    const readError = profileRes.error ?? memRes.error ?? duesRes.error;
    if (readError) return { ok: false, error: dbError(readError, "Leximi i të dhënave të anëtarit dështoi. Provo sërish.") };
    if (!profileRes.data) return { ok: false, error: "Anëtari nuk u gjet. Rifresko faqen." };

    const memberships: PrepayMembership[] = ((memRes.data as unknown as MembershipRead[] | null) ?? []).map((m) => ({
      id: m.id, member_id: m.member_id, status: m.status,
      start_date: m.start_date, end_date: m.end_date,
      amount_eur: m.amount_eur, billable: m.billable,
      plan_name: m.plan?.name_sq ?? null,
    }));
    const dues: PrepayDue[] = ((duesRes.data as unknown as DueRead[] | null) ?? []).map((d) => ({
      id: d.id, period: d.period, status: d.status,
      amount_eur: d.amount_eur, full_amount_eur: d.full_amount_eur,
      invoice_no: d.invoice_no, prepayment_id: d.prepayment_id,
      plan_name: d.membership?.plan?.name_sq ?? null,
    }));

    const today = clubTodayISO();
    const currentPeriod = clubCurrentPeriod();
    const defaultFirstPeriod = defaultPrepayFirstPeriod({ memberId: id, memberships, dues, currentPeriod });
    const preview = computePrepayPreview({
      memberId: id, memberships, dues,
      firstPeriod: opts.firstPeriod ?? defaultFirstPeriod,
      months: opts.months ?? PREPAY_DEFAULT_MONTHS,
      halfPeriods: opts.halfPeriods ?? [],
      paidOn: opts.paidOn ?? today,
      method: opts.method ?? "cash",
      today, currentPeriod,
    });

    return {
      ok: true,
      data: {
        member_id: id,
        full_name: (profileRes.data as { full_name: string }).full_name,
        memberships, dues, defaultFirstPeriod, preview,
      },
    };
  } catch (e) {
    return { ok: false, error: dbError(e, "Leximi i të dhënave të anëtarit dështoi. Provo sërish.") };
  }
}

// ------------------------------------------------------------------ record

export type RecordPrepaymentInput = {
  memberId: string;
  firstPeriod: string;
  months: number;
  paidOn: string;
  method: string;
  halfPeriods?: string[];
  discountReason?: string;
  notes?: string;
};

export type RecordPrepaymentResult =
  | { ok: true; id: string; total: number | null; months: number; firstPeriod: string; rangeLabel: string }
  | { ok: false; error: string };

/**
 * Records one prepayment through record_prepayment. The posted values are
 * checked here only so a malformed request gets its sentence without a round
 * trip; the SQL decides every month itself, under its own lock, and each of
 * its refusal tokens is mapped to the same sentence the modal shows.
 */
export async function recordPrepayment(input: RecordPrepaymentInput): Promise<RecordPrepaymentResult> {
  try {
    const gate = await financeGate();
    if (!gate.ok) return gate;

    const today = clubTodayISO();
    const currentPeriod = clubCurrentPeriod();
    const say = (code: Parameters<typeof prepayBlockMessage>[0]["code"], period: string | null = null) =>
      ({ ok: false as const, error: prepayBlockMessage({ code, period }, currentPeriod) });

    const memberId = String(input?.memberId ?? "").trim();
    if (!UUID_RE.test(memberId)) return { ok: false, error: "Zgjidh një anëtar." };

    const months = Number(input?.months);
    if (!Number.isInteger(months) || months < 1 || months > PREPAY_MAX_MONTHS) return say("invalid_months");

    const method = PREPAY_METHODS.find((m) => m === input?.method);
    if (!method) return say("invalid_method");

    const paidOn = String(input?.paidOn ?? "").trim();
    if (!isIsoDate(paidOn)) return say("invalid_date");

    const firstPeriod = String(input?.firstPeriod ?? "").trim();
    if (!isPeriod(firstPeriod)) return say("invalid_period");
    const range = prepayPeriods(firstPeriod, months);
    const w = prepayWindow(currentPeriod);
    if (range[0] < w.from || range[range.length - 1] > w.to) return say("invalid_period");

    // The CLUB's day, not the server's UTC one.
    if (paidOn > today) return say("future_payment");

    const inRange = new Set(range);
    const half = Array.from(new Set(
      (Array.isArray(input?.halfPeriods) ? input.halfPeriods : []).map((p) => String(p || "").trim()),
    )).filter(Boolean);
    if (half.some((p) => !inRange.has(p))) return say("half_outside_range");

    const reason = String(input?.discountReason ?? "").trim() || HALF_PRICE_DEFAULT_REASON;
    if (half.length > 0 && reason.length > DISCOUNT_REASON_MAX) {
      return { ok: false, error: `Arsyeja mund të ketë deri në ${DISCOUNT_REASON_MAX} shenja.` };
    }
    const notes = String(input?.notes ?? "").trim();
    if (notes.length > PREPAY_NOTES_MAX) {
      return { ok: false, error: `Shënimi mund të ketë deri në ${PREPAY_NOTES_MAX} shenja.` };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_prepayment", {
      p_member_id: memberId,
      p_first_period: firstPeriod,
      p_months: months,
      p_paid_on: paidOn,
      p_method: method,
      p_half_periods: half.length > 0 ? half : null,
      p_discount_reason: half.length > 0 ? reason : null,
      p_notes: notes || null,
    });
    if (error) {
      const token = parsePrepayError(error.message);
      if (token) return { ok: false, error: prepayBlockMessage(token, currentPeriod) };
      if (String(error.code ?? "") === "23505") {
        return { ok: false, error: "Një faturë për këtë anëtar u krijua ndërkohë. Rifresko dhe provo sërish." };
      }
      return { ok: false, error: dbError(error, "Regjistrimi i parapagimit dështoi. Provo sërish.") };
    }
    const id = typeof data === "string" ? data : "";
    if (!UUID_RE.test(id)) return { ok: false, error: "Regjistrimi i parapagimit dështoi. Provo sërish." };

    // The total as the database wrote it — the one printed on the document.
    // A failed read only loses the figure on the confirmation, not the save.
    const back = await supabase.from("dues_prepayments").select("total_eur").eq("id", id).maybeSingle();
    const totalRaw = (back.data as { total_eur: number | string } | null)?.total_eur;

    revalidatePrepay();
    return {
      ok: true,
      id,
      total: totalRaw == null ? null : toEuros(totalRaw),
      months,
      firstPeriod,
      rangeLabel: prepayRangeLabel(firstPeriod, months),
    };
  } catch (e) {
    return { ok: false, error: dbError(e, "Regjistrimi i parapagimit dështoi. Provo sërish.") };
  }
}

// ------------------------------------------------------------------ undo

/**
 * Undoes one prepayment exactly, via undo_prepayment: the invoices it created
 * are deleted (each audited in full), the ones that existed before return to
 * their saved prior state. ADMIN ONLY — destroying invoices is not a routine
 * staff action, the same bar as deleteInvoice.
 */
export async function undoPrepayment(prepaymentId: string): Promise<{ ok: true; touched: number } | { ok: false; error: string }> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return { ok: false, error: gate.error };

    const id = (prepaymentId || "").trim();
    if (!UUID_RE.test(id)) return { ok: false, error: prepayBlockMessage({ code: "not_found", period: null }) };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("undo_prepayment", { p_prepayment_id: id });
    if (error) {
      const token = parsePrepayError(error.message);
      if (token?.code === "forbidden") return { ok: false, error: "Vetëm admini mund ta anulojë një parapagim." };
      if (token) return { ok: false, error: prepayBlockMessage(token) };
      return { ok: false, error: dbError(error, "Anulimi i parapagimit dështoi. Provo sërish.") };
    }

    revalidatePrepay();
    return { ok: true, touched: typeof data === "number" ? data : 0 };
  } catch (e) {
    return { ok: false, error: dbError(e, "Anulimi i parapagimit dështoi. Provo sërish.") };
  }
}
