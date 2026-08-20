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
// Plain module, not the client one: a "use server" file may only EXPORT async
// functions, so these constants have to live somewhere both sides can import.
import {
  RECEIPT_ALLOWED_MIME, RECEIPT_MAX_BYTES, RECEIPT_MAX_COUNT,
  isReceiptPath, newReceiptPath, sniffImageMime, validateReceiptPaths,
} from "./receipt";

export type ExpenseResult = { ok: true } | { ok: false; error: string };
export type ExpenseCreated = { ok: true; id: string } | { ok: false; error: string };
export type ReceiptUploaded = { ok: true; path: string } | { ok: false; error: string };

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
  /** Storage paths returned by uploadReceipt(), one per photo — up to three.
   *  Empty array = no photo. */
  receipt_paths: string[];
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
  receipt_paths: string[];
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

  // 4. club_expenses_receipt_paths_ok() — each path is minted by uploadReceipt()
  //    and never typed, so anything that is not exactly one of ours is a
  //    tampered payload, not a user mistake. At most three, each well-formed and
  //    under receipts/. Rejecting it here keeps the row from ever pointing
  //    outside receipts/, which is what makes the delete paths below safe.
  const receipts = validateReceiptPaths(input.receipt_paths ?? []);
  if (!receipts.ok) {
    return {
      ok: false,
      error: receipts.reason === "count"
        ? `Mund të bashkëngjitësh deri në ${RECEIPT_MAX_COUNT} foto për një shpenzim.`
        : "Fotoja e faturës nuk është e vlefshme. Ngarkoje sërish.",
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
      receipt_paths: receipts.paths,
    },
  };
}

// ------------------------------------------------------------ receipt photo

/**
 * Delete a receipt object, but ONLY if no expense still points at it.
 *
 * Every caller here is a "the photo is going away" path — replaced, detached,
 * or the whole expense deleted — and in each one the row has already stopped
 * referencing the path. The re-check is against the case where it has NOT:
 * two admins editing the same expense in two tabs, where the loser's save
 * would otherwise blank out a photo the winner's row is still displaying.
 * An orphaned object costs the club nothing; a row whose receipt 404s costs it
 * the document.
 *
 * Failures are swallowed on purpose: storage is not the ledger. A cleanup that
 * fails must never turn a saved expense into a failed one.
 */
async function removeReceiptObject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null | undefined,
): Promise<void> {
  if (!path || !isReceiptPath(path)) return;
  try {
    // Any row whose receipt_paths array still CONTAINS this exact path keeps it
    // alive: `contains` maps to the array `@>` operator, so a photo shared onto
    // another expense (or still on this one after a partial edit) is not swept.
    const { data, error } = await supabase
      .from("club_expenses")
      .select("id")
      .contains("receipt_paths", [path])
      .limit(1);
    if (error) return;
    if (((data as { id: string }[] | null) ?? []).length > 0) return;
    await supabase.storage.from("media").remove([path]);
  } catch {
    // Orphan over a broken save.
  }
}

/**
 * Take the photo the browser just compressed and put it in the bucket.
 *
 * Separate from createExpense/updateExpense because the owner is standing in a
 * shop: he photographs the slip while he is still typing the amount, sees the
 * thumbnail appear, and only then saves. Bundling the bytes into the save
 * would mean he learns the upload failed after everything else was already
 * correct — and would push the Server Action body past the 1 MB Next.js
 * accepts for a request that also carries the whole form.
 *
 * The object is written BEFORE any row references it, exactly like the
 * applicant photo in app/join/actions.ts. The window in which it is
 * unreferenced is closed by the form: it discards what it uploaded if the user
 * cancels, and discardReceipt() below refuses to delete anything a row has
 * since claimed.
 */
export async function uploadReceipt(form: FormData): Promise<ReceiptUploaded> {
  try {
    await assertStaff();

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Nuk u zgjodh asnjë foto." };
    }
    // The client already converted to JPEG; this is the bypass check.
    if (!RECEIPT_ALLOWED_MIME.includes(file.type)) {
      return { ok: false, error: "Fotoja duhet të jetë JPG, PNG ose WebP." };
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      return {
        ok: false,
        error: `Fotoja e kalon kufirin prej ${Math.round(RECEIPT_MAX_BYTES / 1024)} KB. Provo ta bësh sërish më afër faturës.`,
      };
    }

    // THE check, not the declared one: file.type is a header the client wrote,
    // so the extension and the stored content type are both derived from the
    // magic number instead. A document renamed .jpg (which the browser skips
    // compressing when it is already small) and a hand-made POST both stop here.
    const buf = await file.arrayBuffer();
    const mime = sniffImageMime(new Uint8Array(buf.slice(0, 12)));
    if (!mime || !RECEIPT_ALLOWED_MIME.includes(mime)) {
      return { ok: false, error: "Kjo skedë nuk është foto. Ngarko një foto JPG, PNG ose WebP." };
    }

    const path = newReceiptPath(mime);
    const supabase = await createClient();
    const { error } = await supabase.storage.from("media").upload(path, buf, {
      contentType: mime,
      upsert: false,
      // The path is random and the object is never overwritten (there is no
      // storage UPDATE policy for receipts/), so it is safe to cache forever.
      cacheControl: "31536000",
    });
    if (error) {
      return { ok: false, error: dbError(error, "Ngarkimi i fotos dështoi. Provo sërish.") };
    }
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: dbError(e, "Ngarkimi i fotos dështoi. Provo sërish.") };
  }
}

/**
 * Throw away a photo that was uploaded and then abandoned — the user tapped
 * "Hiq foton", replaced it, or closed the form without saving.
 *
 * It is a public POST endpoint like any Server Action, so it may only ever
 * touch an unreferenced object under receipts/. Both halves of that sentence
 * are enforced, and neither is negotiable: without the prefix check this is a
 * "delete any object in the bucket" endpoint for staff, and without the
 * reference check it is a "delete any expense's receipt" endpoint.
 */
export async function discardReceipt(path: string): Promise<ExpenseResult> {
  try {
    await assertStaff();
    if (!isReceiptPath(path)) return { ok: false, error: "Fotoja nuk u gjet." };
    const supabase = await createClient();
    await removeReceiptObject(supabase, path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Heqja e fotos dështoi. Provo sërish.") };
  }
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
      .insert({ ...coerced.value, recorded_by: me.id })
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
      .select("id, category_id, receipt_paths")
      .eq("id", id)
      .maybeSingle<{ id: string; category_id: string; receipt_paths: string[] }>();
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
      .update(coerced.value)
      .eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Ruajtja e shpenzimit dështoi. Provo sërish.") };
    }

    // Replacing or detaching a receipt takes the old JPEG with it — otherwise
    // every corrected photo leaves a copy of the club's paperwork sitting in a
    // public bucket that nothing points at and nobody will ever find again.
    // Every path that was on the row but is not on the saved array is now
    // orphaned; removeReceiptObject re-checks references before it deletes.
    const kept = new Set(coerced.value.receipt_paths);
    for (const old of current.receipt_paths ?? []) {
      if (!kept.has(old)) await removeReceiptObject(supabase, old);
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
      })
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
      .select("id, reimbursed, receipt_paths")
      .eq("id", id)
      .maybeSingle<{ id: string; reimbursed: boolean; receipt_paths: string[] }>();
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

    // The row is gone, so its photos have nothing left to document. Deleting
    // them after the row (never before) means a failed delete leaves a receipt
    // attached rather than the expense pointing at a 404.
    for (const path of current.receipt_paths ?? []) {
      await removeReceiptObject(supabase, path);
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Fshirja e shpenzimit dështoi. Provo sërish.") };
  }
}
