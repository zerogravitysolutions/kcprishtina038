"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { FUND_KINDS } from "@/lib/finance";
import type { ClubFundKind, ClubFundStatus } from "@/lib/supabase/types";

export type FundResult = { ok: true } | { ok: false; error: string };

// club_funds_write_staff (migration 20260810000002) — admin + staff, exactly
// like dues. The UI mirrors the policy so nothing else can reach the table.
const FINANCE_ROLES = ["admin", "staff"];

// Role AND status are re-read on every call: a Server Action is a standalone
// POST endpoint, so the admin layout's status gate never runs for it and
// has_role() in SQL only looks at the role. Without this a just-deactivated
// staffer could still record money for as long as their token lives.
async function assertFinanceStaff() {
  const p = await getProfile();
  if (!p || p.status !== "active" || !FINANCE_ROLES.includes(p.role)) throw new Error("forbidden");
  return p;
}

/**
 * Deleting a fund erases the record of money the club received. Editing covers
 * every honest mistake (a typo, a wrong sponsor, a pledge that never came), so
 * the destructive path stays with the admin — the same instinct that keeps
 * invoice history undeletable.
 */
async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.status !== "active" || p.role !== "admin") throw new Error("forbidden");
  return p;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** numeric(10,2) tops out here; anything larger is a typo, not a sponsorship. */
const MAX_AMOUNT = 99_999_999.99;

const FUND_STATUSES: ClubFundStatus[] = ["received", "pledged"];

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A euro amount typed on a phone. The field is type="text" + inputMode (see
 * components/admin/NumericInput), so "6.000", "2500e3" and "abc" can all reach
 * the server; parseFloat would happily turn the first two into 6 and 2500000.
 * The strict regex turns silent corruption into a sentence the owner can act on.
 */
function parseAmount(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = (raw ?? "").trim().replace(/,/g, ".");
  if (!s) return { ok: false, error: "Shkruaj shumën e hyrjes, p.sh. 6000 ose 2500,50." };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) {
    return { ok: false, error: "Shuma duhet të jetë numër, p.sh. 6000 ose 2500,50." };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "Shuma duhet të jetë numër, p.sh. 6000 ose 2500,50." };
  if (n <= 0) return { ok: false, error: "Shuma duhet të jetë më e madhe se 0." };
  if (n > MAX_AMOUNT) return { ok: false, error: "Shuma është shumë e madhe." };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** A real calendar date inside a range a club ledger can plausibly hold. */
function checkDate(raw: string, label: string): { ok: true; value: string } | { ok: false; error: string } {
  const d = (raw ?? "").trim();
  if (!DATE_RE.test(d)) return { ok: false, error: `${label} nuk është e vlefshme.` };
  const parsed = new Date(`${d}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: `${label} nuk është e vlefshme.` };
  if (d < "2000-01-01" || d > "2100-12-31") {
    return { ok: false, error: `${label} duhet të jetë mes vitit 2000 dhe 2100.` };
  }
  return { ok: true, value: d };
}

export type FundInput = {
  title: string;
  /** "YYYY-MM-DD". The day it landed, or — for a pledge — when it is expected. */
  occurred_on: string;
  /** Raw text from the numeric field; "2500,50" is normalised, not truncated. */
  amount_eur: string;
  kind: string;
  /** "" = no sponsor. Required by CHECK when kind is 'sponsor'. */
  sponsor_id: string;
  status: string;
  reference: string;
  notes: string;
};

type FundRowValues = {
  title: string;
  occurred_on: string;
  amount_eur: number;
  kind: ClubFundKind;
  sponsor_id: string | null;
  status: ClubFundStatus;
  reference: string | null;
  notes: string | null;
};

/**
 * Every rule the table enforces, checked here first so the owner reads Albanian
 * instead of a Postgres CHECK violation.
 */
function normalize(input: FundInput): { ok: true; row: FundRowValues } | { ok: false; error: string } {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Shkruaj një titull për hyrjen, p.sh. “Sponsorizim Novus 2026”." };
  if (title.length > 200) return { ok: false, error: "Titulli është shumë i gjatë. Shkurtoje." };

  if (!(FUND_STATUSES as string[]).includes(input.status)) {
    return { ok: false, error: "Zgjidh nëse paratë janë pranuar apo vetëm të premtuara." };
  }
  const status = input.status as ClubFundStatus;

  const date = checkDate(input.occurred_on, status === "received" ? "Data e pranimit" : "Data e pritur");
  if (!date.ok) return date;
  // A pledge may legitimately be dated in the future ("pritet në mars"), but
  // money cannot have LANDED tomorrow — that row would count as cash the club
  // does not have yet.
  if (status === "received" && date.value > todayIso()) {
    return { ok: false, error: "Data e pranimit nuk mund të jetë në të ardhmen. Nëse paratë ende s’kanë arritur, zgjidh “Premtuar”." };
  }

  const amount = parseAmount(input.amount_eur);
  if (!amount.ok) return amount;

  if (!(FUND_KINDS as string[]).includes(input.kind)) {
    return { ok: false, error: "Zgjidh llojin e hyrjes." };
  }
  const kind = input.kind as ClubFundKind;

  const sponsorId = (input.sponsor_id ?? "").trim() || null;
  // club_funds_sponsor_required_ck: a sponsorship without a sponsor could never
  // be counted in that sponsor's position, so the report would under-state what
  // the club actually received from them.
  if (kind === "sponsor" && !sponsorId) {
    return { ok: false, error: "Një sponsorizim duhet të thotë se cili sponsor është. Zgjidh sponsorin ose ndrysho llojin." };
  }

  return {
    ok: true,
    row: {
      title,
      occurred_on: date.value,
      amount_eur: amount.value,
      kind,
      sponsor_id: sponsorId,
      status,
      reference: (input.reference ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
    },
  };
}

// The funds list and the treasury both read this table; the dashboard reads
// money too. Nudge them all after every write.
function revalidateFunds() {
  revalidatePath("/admin/finance/funds");
  revalidatePath("/admin/finance/overview");
  revalidatePath("/admin/dashboard");
}

/** Records money in that is not a membership invoice. */
export async function createFund(input: FundInput): Promise<FundResult> {
  try {
    const me = await assertFinanceStaff();

    const parsed = normalize(input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase
      .from("club_funds")
      .insert({ ...parsed.row, recorded_by: me.id });
    if (error) return { ok: false, error: dbError(error, "Ruajtja e hyrjes dështoi. Provo sërish.") };

    revalidateFunds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/**
 * Edits one fund. A pledge that lands is the same row with a new status and a
 * corrected date — one row per sponsorship, its whole life visible, instead of
 * a pledge row plus a receipt row nobody reconciles.
 */
export async function updateFund(fundId: string, input: FundInput): Promise<FundResult> {
  try {
    const me = await assertFinanceStaff();

    const parsed = normalize(input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { error } = await supabase
      .from("club_funds")
      .update({ ...parsed.row, recorded_by: me.id })
      .eq("id", fundId);
    if (error) return { ok: false, error: dbError(error, "Ruajtja e hyrjes dështoi. Provo sërish.") };

    revalidateFunds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/**
 * The one-click path for the thing that happens most: a promise turns into
 * money. The date is asked for because occurred_on then means "the day it
 * landed" — keeping the agreed date would file the cash in the wrong month.
 */
export async function markFundReceived(fundId: string, date: string): Promise<FundResult> {
  try {
    const me = await assertFinanceStaff();

    const parsed = checkDate(date, "Data e pranimit");
    if (!parsed.ok) return parsed;
    if (parsed.value > todayIso()) {
      return { ok: false, error: "Data e pranimit nuk mund të jetë në të ardhmen." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("club_funds")
      .update({ status: "received", occurred_on: parsed.value, recorded_by: me.id })
      .eq("id", fundId);
    if (error) return { ok: false, error: dbError(error, "Shënimi si i pranuar dështoi. Provo sërish.") };

    revalidateFunds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/** Undoes a receipt recorded by mistake: back to a pledge, same row, same date. */
export async function markFundPledged(fundId: string): Promise<FundResult> {
  try {
    const me = await assertFinanceStaff();

    const supabase = await createClient();
    const { error } = await supabase
      .from("club_funds")
      .update({ status: "pledged", recorded_by: me.id })
      .eq("id", fundId);
    if (error) return { ok: false, error: dbError(error, "Kthimi në premtim dështoi. Provo sërish.") };

    revalidateFunds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

/** Removes a row entered by mistake. Admin only — see assertAdmin above. */
export async function deleteFund(fundId: string): Promise<FundResult> {
  try {
    await assertAdmin();

    const supabase = await createClient();
    const { error } = await supabase.from("club_funds").delete().eq("id", fundId);
    if (error) return { ok: false, error: dbError(error, "Fshirja e hyrjes dështoi. Provo sërish.") };

    revalidateFunds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
