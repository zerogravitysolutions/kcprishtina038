"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
// The strict parser the coach forms already use: the amount field is
// type="text" + inputMode (a numeric KEYPAD, not a numeric FIELD), so "42,5",
// "42..5" and "650€" can all reach the server. parseFloat would silently turn
// the last two into numbers; this rejects them.
import { parseStrictNumber } from "@/lib/training";
import type { ExpensePaidBy, ExpensePaymentMethod, ExpenseStatus } from "@/lib/supabase/types";

export type ExpenseResult = { ok: true } | { ok: false; error: string };
export type ExpenseCreated = { ok: true; id: string } | { ok: false; error: string };

// club_expenses_write_staff (migration 20260810000002) — money is admin + staff.
const WRITE_ROLES = ["admin", "staff"];

// Role AND status, like requireAdmin() in app/admin/actions.ts: a Server Action
// is a standalone POST endpoint and the admin layout's status gate never runs
// for it.
async function assertStaff() {
  const p = await getProfile();
  if (!p || p.status !== "active" || !WRITE_ROLES.includes(p.role)) throw new Error("forbidden");
  return p;
}

async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.status !== "active" || p.role !== "admin") throw new Error("forbidden");
  return p;
}

function revalidate() {
  revalidatePath("/admin/finance/expenses");
  revalidatePath("/admin/finance");
}

// ------------------------------------------------------------------ input

/**
 * Exactly what the form holds, as raw strings — no coercion on the client, so
 * the same rules run whichever path reaches the database.
 *
 * `paid_by` / `paid_by_member_id` are a pair on purpose (club_expenses_paid_by_ck):
 * the form renders them as ONE "Paguar nga" select whose value is either the
 * club or a person, and splits it here.
 */
export type ExpenseInput = {
  occurred_on: string;
  category_id: string;
  description: string;
  /** Raw text. Empty = no price agreed yet, stored as NULL. NEVER 0. */
  amount_eur: string;
  /** "" / null = the club itself ("Klubi" in the sheet), not "unknown". */
  beneficiary_member_id: string | null;
  invoice_no: string;
  payment_method: ExpensePaymentMethod | "";
  paid_by: ExpensePaidBy;
  paid_by_member_id: string | null;
  funding_sponsor_id: string | null;
  status: ExpenseStatus;
  reimbursed: boolean;
  reimbursed_note: string;
  notes: string;
};

type ExpensePayload = {
  occurred_on: string;
  category_id: string;
  description: string;
  amount_eur: number | null;
  beneficiary_member_id: string | null;
  invoice_no: string | null;
  payment_method: ExpensePaymentMethod | null;
  paid_by: ExpensePaidBy;
  paid_by_member_id: string | null;
  funding_sponsor_id: string | null;
  status: ExpenseStatus;
  reimbursed: boolean;
  reimbursed_note: string | null;
  notes: string | null;
};

const STATUSES: ExpenseStatus[] = ["paid", "unpaid"];
const METHODS: ExpensePaymentMethod[] = ["cash", "transfer"];

/** A real calendar day in "YYYY-MM-DD", not merely a string that looks like one. */
function isCalendarDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

function idOrNull(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s && s !== "club" && s !== "all" && s !== "none" ? s : null;
}

/**
 * Every rule the three CHECK constraints encode, restated as an Albanian
 * sentence. The form blocks these combinations before the user can save them,
 * but this runs anyway: a Server Action is a public POST endpoint, and a raw
 * 23514 tells the owner nothing about what to fix.
 */
// NOT exported: in a "use server" module every export must be an async
// function, and this one is deliberately synchronous and pure.
function coerceExpense(
  input: ExpenseInput,
): { ok: true; value: ExpensePayload } | { ok: false; error: string } {
  const occurredOn = (input.occurred_on ?? "").trim();
  if (!occurredOn) return { ok: false, error: "Data e shpenzimit mungon." };
  if (!isCalendarDate(occurredOn)) return { ok: false, error: "Data nuk është e vlefshme." };
  if (occurredOn < "2000-01-01") {
    return { ok: false, error: "Data duket e gabuar — kontrollo vitin." };
  }

  const categoryId = idOrNull(input.category_id);
  if (!categoryId) return { ok: false, error: "Zgjidh një kategori për shpenzimin." };

  const description = (input.description ?? "").trim();
  if (!description) return { ok: false, error: "Shkruaj se për çfarë është ky shpenzim." };
  if (description.length > 400) {
    return { ok: false, error: "Përshkrimi është shumë i gjatë. Shkurtoje dhe provo sërish." };
  }

  // amount_eur is NULLABLE on purpose: the club has real costs with no price
  // agreed yet. Empty stays NULL — it must never become 0, which would make an
  // unknown cost read as a free one.
  let amount: number | null = null;
  const rawAmount = (input.amount_eur ?? "").trim();
  if (rawAmount) {
    const parsed = parseStrictNumber(rawAmount);
    if (parsed === null) {
      return {
        ok: false,
        error: "Shuma duhet të jetë numër, p.sh. 40 ose 40,5. Lëre bosh nëse çmimi nuk është caktuar ende.",
      };
    }
    if (parsed < 0) return { ok: false, error: "Shuma nuk mund të jetë negative." };
    if (parsed > 999999) return { ok: false, error: "Shuma është shumë e madhe." };
    amount = Math.round(parsed * 100) / 100;
  }

  const status: ExpenseStatus = STATUSES.includes(input.status) ? input.status : "paid";
  const method = (input.payment_method ?? "") as ExpensePaymentMethod | "";
  const paymentMethod: ExpensePaymentMethod | null =
    method && METHODS.includes(method) ? method : null;

  // 1. club_expenses_paid_by_ck — paid_by = 'member' EXACTLY when a person is
  //    named. 'member' with nobody named is a debt owed to no one (it vanishes
  //    from the reimbursement list); 'club' with a person named is a debt the
  //    club does not have.
  const paidBy: ExpensePaidBy = input.paid_by === "member" ? "member" : "club";
  const payerId = paidBy === "member" ? idOrNull(input.paid_by_member_id) : null;
  if (paidBy === "member" && !payerId) {
    return {
      ok: false,
      error: "Zgjidh personin që i ka dhënë paratë, ose vendos “Klubi” te “Paguar nga”.",
    };
  }

  // 2. club_expenses_unpaid_no_payer_ck — a cost nobody has settled yet cannot
  //    name an individual payer, or the club would owe them money they never
  //    spent.
  if (status === "unpaid" && paidBy === "member") {
    return {
      ok: false,
      error:
        "Një shpenzim i papaguar nuk mund të ketë pagues individual — askush nuk i ka dhënë ende paratë. Vendos statusin “Paguar”, ose zgjidh “Klubi” te “Paguar nga”.",
    };
  }

  // 3. club_expenses_reimbursed_ck — only a cost fronted by a person can be
  //    reimbursed; the club cannot reimburse itself.
  const reimbursed = paidBy === "member" ? !!input.reimbursed : false;
  if (input.reimbursed && paidBy !== "member") {
    return {
      ok: false,
      error: "Vetëm një shpenzim që e ka paguar një person mund të shënohet si i rimbursuar.",
    };
  }

  return {
    ok: true,
    value: {
      occurred_on: occurredOn,
      category_id: categoryId,
      description,
      amount_eur: amount,
      beneficiary_member_id: idOrNull(input.beneficiary_member_id),
      // "pa faturë" is the ABSENCE of an invoice number, so it is NULL — stored
      // as text it would group and sort as though many costs shared one number.
      invoice_no: clean(input.invoice_no),
      payment_method: paymentMethod,
      paid_by: paidBy,
      paid_by_member_id: payerId,
      funding_sponsor_id: idOrNull(input.funding_sponsor_id),
      status,
      reimbursed,
      reimbursed_note: reimbursed ? clean(input.reimbursed_note) : null,
      notes: clean(input.notes),
    },
  };
}

/** A retired category may keep its old rows but must not collect new ones. */
async function assertCategoryUsable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, active")
    .eq("id", categoryId)
    .maybeSingle<{ id: string; active: boolean }>();
  if (error) return dbError(error, "Leximi i kategorive dështoi. Provo sërish.");
  if (!data) return "Kjo kategori nuk ekziston më. Rifresko faqen dhe zgjidh një tjetër.";
  if (!data.active) return "Kjo kategori është joaktive. Zgjidh një kategori aktive.";
  return null;
}

// ------------------------------------------------------------------ create

export async function createExpense(input: ExpenseInput): Promise<ExpenseCreated> {
  try {
    const me = await assertStaff();
    const coerced = coerceExpense(input);
    if (!coerced.ok) return coerced;

    const supabase = await createClient();
    const catErr = await assertCategoryUsable(supabase, coerced.value.category_id);
    if (catErr) return { ok: false, error: catErr };

    const { data, error } = await supabase
      .from("club_expenses")
      .insert({ ...coerced.value, recorded_by: me.id } as never)
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false, error: dbError(error, "Ruajtja e shpenzimit dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: dbError(e, "Ruajtja e shpenzimit dështoi. Provo sërish.") };
  }
}

// ------------------------------------------------------------------ update

export async function updateExpense(id: string, input: ExpenseInput): Promise<ExpenseResult> {
  try {
    await assertStaff();
    if (!id) return { ok: false, error: "Shpenzimi nuk u gjet." };

    const coerced = coerceExpense(input);
    if (!coerced.ok) return coerced;

    const supabase = await createClient();
    const { data: current, error: readErr } = await supabase
      .from("club_expenses")
      .select("id, category_id")
      .eq("id", id)
      .maybeSingle<{ id: string; category_id: string }>();
    if (readErr) return { ok: false, error: dbError(readErr, "Leximi i shpenzimit dështoi.") };
    if (!current) return { ok: false, error: "Ky shpenzim nuk ekziston më. Rifresko faqen." };

    // Only a CHANGE of category has to land on an active one; a row already
    // filed under a retired category may be edited without being re-filed.
    if (coerced.value.category_id !== current.category_id) {
      const catErr = await assertCategoryUsable(supabase, coerced.value.category_id);
      if (catErr) return { ok: false, error: catErr };
    }

    const { error } = await supabase
      .from("club_expenses")
      .update(coerced.value as never)
      .eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Ruajtja e shpenzimit dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Ruajtja e shpenzimit dështoi. Provo sërish.") };
  }
}

// ------------------------------------------------------ reimbursement

/**
 * Settle (or un-settle) a cost a person fronted out of their own pocket.
 *
 * The settlement happens in kind — "i kam rimbursuar me naftë" — so there is no
 * payment row to link to and the note IS the record. It is kept separate from
 * the edit form because it is the one action taken repeatedly, months after the
 * expense itself was entered.
 */
export async function setReimbursed(
  id: string,
  input: { reimbursed: boolean; note: string },
): Promise<ExpenseResult> {
  try {
    await assertStaff();
    if (!id) return { ok: false, error: "Shpenzimi nuk u gjet." };

    const supabase = await createClient();
    const { data: current, error: readErr } = await supabase
      .from("club_expenses")
      .select("id, paid_by, paid_by_member_id")
      .eq("id", id)
      .maybeSingle<{ id: string; paid_by: ExpensePaidBy; paid_by_member_id: string | null }>();
    if (readErr) return { ok: false, error: dbError(readErr, "Leximi i shpenzimit dështoi.") };
    if (!current) return { ok: false, error: "Ky shpenzim nuk ekziston më. Rifresko faqen." };

    // club_expenses_reimbursed_ck, in words.
    if (input.reimbursed && current.paid_by !== "member") {
      return {
        ok: false,
        error:
          "Këtë shpenzim e ka paguar klubi, prandaj nuk ka kujt t’i rimbursohet. Ndryshoje “Paguar nga” nëse paratë i ka dhënë një person.",
      };
    }

    const { error } = await supabase
      .from("club_expenses")
      .update({
        reimbursed: input.reimbursed,
        // Un-marking removes the note too: it describes a settlement that no
        // longer stands, and leaving it behind would read as though the debt
        // had been paid twice.
        reimbursed_note: input.reimbursed ? clean(input.note) : null,
      } as never)
      .eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Shënimi i rimbursimit dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Shënimi i rimbursimit dështoi. Provo sërish.") };
  }
}

// ------------------------------------------------------------------ delete

/**
 * Fshirja e një shpenzimi.
 *
 * WHY THIS IS DELETABLE AT ALL, AND WHY ONLY LIKE THIS
 * ----------------------------------------------------
 * A dues invoice is a document the club ISSUED and handed to a member, so
 * migration 20260810000001 protects the invoice history from deletion. A
 * club_expenses row is not that: it is an internal ledger line about a cost a
 * third party charged, entered on a phone in a bike shop. Typos and duplicates
 * are certain, there is no `voided` column to soft-delete into, and forcing a
 * wrong line to live forever would push the owner straight back to the
 * spreadsheet this screen replaces.
 *
 * So deletion exists, but narrowed on two axes:
 *   - ADMIN ONLY. Staff record and correct; only the owner removes. (RLS lets
 *     staff delete, so this is a deliberate UI-level rule, not a security
 *     boundary — it is the same shape as the admin-only membership plans.)
 *   - NEVER a reimbursed row. Once a person has been paid back, this row is the
 *     only record that the settlement happened. Deleting it erases both the
 *     debt and the proof it was cleared. The admin must first undo the
 *     reimbursement — two deliberate steps, not one tap.
 */
export async function deleteExpense(id: string): Promise<ExpenseResult> {
  try {
    await assertAdmin();
    if (!id) return { ok: false, error: "Shpenzimi nuk u gjet." };

    const supabase = await createClient();
    const { data: current, error: readErr } = await supabase
      .from("club_expenses")
      .select("id, reimbursed")
      .eq("id", id)
      .maybeSingle<{ id: string; reimbursed: boolean }>();
    if (readErr) return { ok: false, error: dbError(readErr, "Leximi i shpenzimit dështoi.") };
    if (!current) return { ok: false, error: "Ky shpenzim nuk ekziston më. Rifresko faqen." };

    if (current.reimbursed) {
      return {
        ok: false,
        error:
          "Ky shpenzim është shënuar si i rimbursuar dhe është i vetmi dokument që e dëshmon shlyerjen. Zhbëj së pari rimbursimin, pastaj fshije.",
      };
    }

    const { error } = await supabase.from("club_expenses").delete().eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Fshirja e shpenzimit dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Fshirja e shpenzimit dështoi. Provo sërish.") };
  }
}
