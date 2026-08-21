"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  billingMode, coveringMemberships, currentPeriod, isBillable, periodLabel, periodOf,
  shiftPeriod, type BillingMode,
} from "@/lib/finance";
import type { DueUpdate, MembershipStatus, PaidMethod } from "@/lib/supabase/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// dues_write_staff (migration 0006) lets admin + staff write invoices, so the
// UI mirrors exactly that. Anything else must not reach the table.
const FINANCE_ROLES = ["admin", "staff"];

// Status is re-read on every call, like requireAdmin() in app/admin/actions.ts:
// a Server Action is a standalone POST endpoint, so the admin layout's
// status gate never runs for it, and has_role() in SQL only looks at the role.
// Without this a just-deactivated staffer could still move money for as long as
// their access token lives.
async function assertFinanceStaff() {
  const p = await getProfile();
  if (!p || p.status !== "active" || !FINANCE_ROLES.includes(p.role)) throw new Error("forbidden");
  return p;
}

/** Methods a human can pick. 'waived' is set by waiveInvoice, never chosen. */
const PAYMENT_METHODS: PaidMethod[] = ["cash", "bank", "online"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "2026-08-13" → "2026-08-01", the first-of-month idempotency bucket. */
function periodFromDate(date: string): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  return periodOf(Number(m[1]), month0);
}

/**
 * A "YYYY-MM-DD" payment date becomes noon UTC. Kosovo is UTC+1/+2, so noon
 * UTC is still the same calendar day locally — storing midnight would show the
 * payment a day early in some browsers.
 */
function paidAtFromDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toISOString();
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The invoice screens are force-dynamic, but the member portal and the
// dashboard both read dues too — nudge them after every write.
function revalidateFinance() {
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/overview");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal");
}

/** Marks one invoice paid: method + date + who recorded it. */
export async function markInvoicePaid(
  invoiceId: string,
  input: { method: string; date: string; notes?: string },
): Promise<ActionResult> {
  try {
    const me = await assertFinanceStaff();

    // find() rather than includes() so `method` narrows to PaidMethod and the
    // update below needs no cast.
    const method = PAYMENT_METHODS.find((m) => m === input.method);
    if (!method) {
      return { ok: false, error: "Zgjidh një mënyrë pagese: kesh, bankë ose online." };
    }
    const date = (input.date || "").trim();
    if (!DATE_RE.test(date)) {
      return { ok: false, error: "Data e pagesës nuk është e vlefshme." };
    }
    if (date > todayIso()) {
      return { ok: false, error: "Data e pagesës nuk mund të jetë në të ardhmen." };
    }

    const patch: DueUpdate = {
      status: "paid",
      paid_method: method,
      paid_at: paidAtFromDate(date),
      recorded_by: me.id,
    };
    const note = (input.notes ?? "").trim();
    if (note) patch.notes = note;

    const supabase = await createClient();
    const { error } = await supabase
      .from("dues")
      .update(patch)
      .eq("id", invoiceId);
    if (error) return { ok: false, error: dbError(error, "Regjistrimi i pagesës dështoi. Provo sërish.") };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/** Forgives one invoice. The reason is mandatory — it is the only paper trail. */
export async function waiveInvoice(invoiceId: string, reason: string): Promise<ActionResult> {
  try {
    const me = await assertFinanceStaff();

    const note = (reason || "").trim();
    if (note.length < 3) {
      return { ok: false, error: "Shkruaj arsyen pse kjo faturë falet." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dues")
      .update({
        status: "waived",
        paid_method: "waived",
        paid_at: new Date().toISOString(),
        recorded_by: me.id,
        notes: note,
      })
      .eq("id", invoiceId);
    if (error) return { ok: false, error: dbError(error, "Falja e faturës dështoi. Provo sërish.") };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/**
 * Reverses a payment (or a waiver) recorded by mistake: back to unpaid with the
 * payment fields cleared. The invoice itself is never deleted, and `notes` is
 * kept on purpose so the reason for the original entry stays readable.
 */
export async function reopenInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    const me = await assertFinanceStaff();

    const supabase = await createClient();
    const { error } = await supabase
      .from("dues")
      .update({
        status: "unpaid",
        paid_at: null,
        paid_method: null,
        recorded_by: me.id,
      })
      .eq("id", invoiceId);
    if (error) return { ok: false, error: dbError(error, "Zhbërja e pagesës dështoi. Provo sërish.") };

    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/**
 * Runs the monthly invoice generation for one period. The RPC is idempotent
 * (unique(member_id, period)), so calling it twice creates nothing the second
 * time — the UI says so, because the owner will press it twice.
 */
export async function generateInvoices(
  period: string,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    await assertFinanceStaff();

    if (!DATE_RE.test(period)) {
      return { ok: false, error: "Periudha nuk është e vlefshme." };
    }
    // The month chips let the admin browse any month, and the button always
    // names the month on screen — so one stray click on a future month would
    // issue real invoices for a month that has not started, freeze today's
    // price into them and leave no way to delete them (the UI can only waive).
    // The cron issues each month on the 1st; there is never a reason to run
    // ahead of it.
    if (period > currentPeriod()) {
      return {
        ok: false,
        error: `${periodLabel(period)} nuk ka filluar ende — faturat gjenerohen në fillim të muajit.`,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "generate_dues_for_period",
      { p_period: period },
    );
    if (error) return { ok: false, error: dbError(error, "Gjenerimi i faturave dështoi. Provo sërish.") };

    revalidateFinance();
    return { ok: true, created: typeof data === "number" ? data : 0 };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

// ------------------------------------------------------- who can be billed
//
// The modal's member list. It lives here, in ONE async function, because the
// list has to be recomputed from the client the moment the admin picks an
// invoice date in another month — a roster computed for the page's month while
// the date says another one is the exact lie that made this feature useless.
// The page calls it too (a direct call, not a POST), so the first paint and
// every refetch come out of the same pick.

/** One member the generator would bill for the asked period. */
export type EligibleMember = {
  member_id: string;
  full_name: string;
  plan_name: string | null;
};

/** A membership that exists but has not started yet in the asked period. */
export type UpcomingMembership = {
  member_id: string;
  full_name: string;
  /** "YYYY-MM-DD" — the day billing begins for this rider. */
  start_date: string;
};

/** A membership in force for the period that produces no invoice, and why. */
export type NonBillableMembership = {
  member_id: string;
  full_name: string;
  /** 'non_billable' = a racer, 'waived' = a paying tier priced at 0. */
  mode: BillingMode;
};

/**
 * WHY the list is empty, decided from counts on the server — never guessed in
 * the UI. The old copy named two causes and omitted the real one, and the owner
 * spent a day on it.
 */
export type EligibilityReason =
  | "ok"              // there is someone to bill
  | "no_memberships"  // not one membership row exists — nobody was ever enrolled
  | "none_covering"   // memberships exist, none is in force for this month
  | "none_billable"   // in force, but non-billable (racer) or priced at 0
  | "all_billed";     // everyone billable already holds an invoice for it

export type Eligibility = {
  /** The month this answer is about. Always first-of-month. */
  period: string;
  members: EligibleMember[];
  reason: EligibilityReason;
  /** Every membership row that was examined. 0 means nobody is enrolled. */
  totalMemberships: number;
  /** Members in force AND billable for the period, invoiced or not. */
  billableCount: number;
  /** How many of those already hold an invoice for the period. */
  alreadyBilled: number;
  upcoming: UpcomingMembership[];
  upcomingTotal: number;
  nonBillable: NonBillableMembership[];
  nonBillableTotal: number;
};

export type EligibilityResult =
  | { ok: true; data: Eligibility }
  | { ok: false; error: string };

const MEMBERSHIP_SELECT =
  "id, member_id, amount_eur, billable, status, start_date, end_date, " +
  "member:profiles!member_id(full_name), plan:membership_plans!plan_id(name_sq)";

type MembershipRow = {
  id: string;
  member_id: string;
  amount_eur: number | string | null;
  billable: boolean;
  status: MembershipStatus;
  start_date: string;
  end_date: string | null;
  member: { full_name: string } | null;
  plan: { name_sq: string } | null;
};

/** Enough names to explain the empty state without shipping the whole club. */
const REASON_LIST_CAP = 12;

const UNKNOWN_MEMBER = "Anëtar i panjohur";

function byName(a: { full_name: string }, b: { full_name: string }): number {
  return a.full_name.localeCompare(b.full_name, "sq");
}

/**
 * The members the generator would bill for `period`, plus the counts that
 * explain the answer when the list comes back empty.
 *
 * The pick is coveringMemberships() + isBillable() minus anyone who already has
 * an invoice for the period — deliberately the same three steps as the
 * covering/eligible CTEs inside generate_dues_for_members, so the modal can
 * never offer a member the RPC would then silently skip.
 *
 * A failed read is returned as an ERROR, never as an empty list: "the query
 * failed" and "nobody qualifies" look identical on screen, and telling them
 * apart is the whole point of this function.
 */
export async function eligibleMembersForPeriod(period: string): Promise<EligibilityResult> {
  try {
    await assertFinanceStaff();

    const p = (period || "").trim();
    // periodFromDate(p) === p also rejects a mid-month date: the period IS the
    // first-of-month idempotency bucket, and anything else would silently
    // answer about a different set of rows than it was asked about.
    if (!DATE_RE.test(p) || periodFromDate(p) !== p) {
      return { ok: false, error: "Muaji i faturimit nuk është i vlefshëm." };
    }

    const supabase = await createClient();
    // Ordered before the cap, like every other capped read in the panel: an
    // unordered limit returns an arbitrary slice, so which memberships got
    // dropped — i.e. which member silently stopped being offered a bill —
    // would change between refreshes. Newest first, so the cap can only ever
    // cut the oldest (most likely already-ended) rows.
    const memRes = await supabase
      .from("memberships")
      .select(MEMBERSHIP_SELECT)
      .order("start_date", { ascending: false })
      .limit(2000);
    if (memRes.error) {
      return { ok: false, error: dbError(memRes.error, "Leximi i anëtarësive dështoi. Provo sërish.") };
    }
    // Only the ids: who already has an invoice for this month. Read here rather
    // than reused from the page, so the answer stays right when the page list
    // is capped or when this is called for a month the page is not showing.
    const billedRes = await supabase.from("dues").select("member_id").eq("period", p).limit(5000);
    if (billedRes.error) {
      return { ok: false, error: dbError(billedRes.error, "Leximi i faturave të muajit dështoi. Provo sërish.") };
    }

    const memberships = (memRes.data as unknown as MembershipRow[] | null) ?? [];
    const billedIds = new Set(
      ((billedRes.data as { member_id: string }[] | null) ?? []).map((d) => d.member_id),
    );

    const covering = coveringMemberships(memberships, p);
    const coveringIds = new Set(covering.map((m) => m.member_id));
    const billable = covering.filter(isBillable);

    const members: EligibleMember[] = billable
      .filter((m) => !billedIds.has(m.member_id))
      .map((m) => ({
        member_id: m.member_id,
        full_name: m.member?.full_name ?? UNKNOWN_MEMBER,
        plan_name: m.plan?.name_sq ?? null,
      }))
      .sort(byName);

    // Memberships that only START after this month — the case the old copy did
    // not know about, and the one that was actually true in production.
    const nextPeriod = shiftPeriod(p, 1);
    const upcomingByMember = new Map<string, UpcomingMembership>();
    for (const m of memberships) {
      if (m.status === "ended") continue;
      if (coveringIds.has(m.member_id)) continue;
      if (m.start_date < nextPeriod) continue;
      const held = upcomingByMember.get(m.member_id);
      // Earliest start wins: that is the day this rider starts costing money.
      if (!held || m.start_date < held.start_date) {
        upcomingByMember.set(m.member_id, {
          member_id: m.member_id,
          full_name: m.member?.full_name ?? UNKNOWN_MEMBER,
          start_date: m.start_date,
        });
      }
    }
    const upcomingAll = [...upcomingByMember.values()]
      .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : byName(a, b)));

    const nonBillableAll: NonBillableMembership[] = covering
      .filter((m) => !isBillable(m))
      .map((m) => ({
        member_id: m.member_id,
        full_name: m.member?.full_name ?? UNKNOWN_MEMBER,
        mode: billingMode(m),
      }))
      .sort(byName);

    const reason: EligibilityReason =
      members.length > 0 ? "ok"
        : memberships.length === 0 ? "no_memberships"
          : billable.length > 0 ? "all_billed"
            : covering.length > 0 ? "none_billable"
              : "none_covering";

    return {
      ok: true,
      data: {
        period: p,
        members,
        reason,
        totalMemberships: memberships.length,
        billableCount: billable.length,
        alreadyBilled: billable.length - members.length,
        upcoming: upcomingAll.slice(0, REASON_LIST_CAP),
        upcomingTotal: upcomingAll.length,
        nonBillable: nonBillableAll.slice(0, REASON_LIST_CAP),
        nonBillableTotal: nonBillableAll.length,
      },
    };
  } catch (e) {
    return { ok: false, error: dbError(e, "Leximi i anëtarëve për faturim dështoi. Provo sërish.") };
  }
}

/**
 * Bills a CHOSEN set of members for the month of a CHOSEN invoice date, via
 * generate_dues_for_members. This is what the "Gjenero fatura" modal calls.
 *
 * The posted member list is never trusted: the RPC's own covering/eligible CTE
 * only bills members whose in-force membership is billable with an amount > 0
 * and who do NOT already have an invoice for the period, so a stray or stale id
 * simply bills nobody. Here we merely reject a malformed request and re-derive
 * the period from the invoice date (never from a posted period), because the
 * period — not issued_on — is the first-of-month idempotency bucket.
 *
 * `expectedPeriod` is the month the CALLER believed it was billing. It is not
 * used to pick the bucket — the date still decides that — it is only checked
 * against it, so a screen whose date and whose member list have drifted apart
 * gets an error instead of quietly billing a different month than it showed.
 */
export async function generateInvoicesForMembers(
  memberIds: string[],
  issuedOn: string,
  expectedPeriod: string,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    await assertFinanceStaff();

    const on = (issuedOn || "").trim();
    if (!DATE_RE.test(on)) {
      return { ok: false, error: "Data e faturës nuk është e vlefshme." };
    }
    const period = periodFromDate(on);
    if (!period) {
      return { ok: false, error: "Data e faturës nuk është e vlefshme." };
    }
    const expected = (expectedPeriod || "").trim();
    if (!DATE_RE.test(expected) || periodFromDate(expected) !== expected) {
      return { ok: false, error: "Muaji i faturimit nuk është i vlefshëm." };
    }
    if (expected !== period) {
      return {
        ok: false,
        error: `Data e faturës nuk bie në ${periodLabel(expected)}. Rifresko faqen dhe provo sërish.`,
      };
    }
    // A future MONTH cannot be billed: the invoices would freeze today's price
    // into a month that has not begun and can only be waived, never deleted.
    if (period > currentPeriod()) {
      return {
        ok: false,
        error: `${periodLabel(period)} nuk ka filluar ende — faturat gjenerohen brenda muajit.`,
      };
    }

    const ids = Array.from(new Set(
      (Array.isArray(memberIds) ? memberIds : []).map((s) => String(s || "").trim()),
    )).filter((s) => UUID_RE.test(s));
    if (ids.length === 0) {
      return { ok: false, error: "Zgjidh të paktën një anëtar." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("generate_dues_for_members", {
      p_period: period,
      p_member_ids: ids,
      p_issued_on: on,
    });
    if (error) return { ok: false, error: dbError(error, "Gjenerimi i faturave dështoi. Provo sërish.") };

    revalidateFinance();
    return { ok: true, created: typeof data === "number" ? data : 0 };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
