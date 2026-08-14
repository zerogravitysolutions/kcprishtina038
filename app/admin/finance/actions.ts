"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { currentPeriod, periodLabel } from "@/lib/finance";
import type { DueUpdate, PaidMethod } from "@/lib/supabase/types";

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
