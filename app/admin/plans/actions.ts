"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

export type PlanResult = { ok: true } | { ok: false; error: string };

// membership_plans_write_admin — only admin may edit the tiers.
// Role AND status, like requireAdmin() in app/admin/actions.ts — a Server
// Action is a standalone POST endpoint and the layout's status gate never runs
// for it.
async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.status !== "active" || p.role !== "admin") throw new Error("forbidden");
  return p;
}

export type PlanInput = {
  name_sq: string;
  description_sq: string;
  /** Raw text from the form. Ignored (and stored as NULL) when billable is false. */
  amount_eur: string;
  billable: boolean;
  active: boolean;
};

/**
 * Edits one tier. Price changes apply only to memberships created afterwards:
 * memberships freeze amount_eur at signup and invoices freeze it again at
 * generation, so nothing already issued is restated here.
 */
export async function updatePlan(planId: string, input: PlanInput): Promise<PlanResult> {
  try {
    await assertAdmin();

    const name = input.name_sq.trim();
    if (!name) return { ok: false, error: "Emri i planit mungon." };

    // The DB has a CHECK (not billable or amount_eur is not null); catch it here
    // so the owner reads a sentence instead of a constraint violation.
    let amount: number | null = null;
    if (input.billable) {
      const raw = input.amount_eur.trim().replace(",", ".");
      if (!raw) return { ok: false, error: "Një plan me pagesë duhet të ketë çmim mujor." };
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return { ok: false, error: "Çmimi duhet të jetë numër, p.sh. 40 ose 40.50." };
      if (parsed <= 0) {
        return { ok: false, error: "Çmimi mujor duhet të jetë më i madh se 0. Për një plan pa pagesë, hiq shenjën te “Faturohet çdo muaj”." };
      }
      if (parsed > 999999) return { ok: false, error: "Çmimi është shumë i madh." };
      amount = Math.round(parsed * 100) / 100;
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("membership_plans")
      .update({
        name_sq: name,
        description_sq: input.description_sq.trim() || null,
        amount_eur: amount,
        billable: input.billable,
        active: input.active,
      } as never)
      .eq("id", planId);
    if (error) return { ok: false, error: dbError(error, "Ruajtja e planit dështoi. Provo sërish.") };

    revalidatePath("/admin/plans");
    revalidatePath("/admin/finance");
    revalidatePath("/join");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
