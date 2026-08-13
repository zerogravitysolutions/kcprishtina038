"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

export type CategoryResult = { ok: true } | { ok: false; error: string };

/**
 * RLS on expense_categories is admin + staff (it has to be, or staff could not
 * even read the list to file an expense). Managing the list is narrower on
 * purpose: the category is the ONLY classification the ledger has, and a rename
 * or a retirement changes every report that groups by it. That is the owner's
 * call, so this file is admin-only.
 */
async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.status !== "active" || p.role !== "admin") throw new Error("forbidden");
  return p;
}

function revalidate() {
  revalidatePath("/admin/finance/expenses/categories");
  revalidatePath("/admin/finance/expenses");
}

/**
 * A stable key for a new category, derived from its Albanian name.
 * `code` is CHECKed against ^[a-z][a-z0-9_]*$ in the migration, so ë/ç and
 * every space have to go before it reaches the database.
 */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/ë/g, "e")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  // The CHECK also demands it start with a letter.
  return /^[a-z]/.test(base) ? base.slice(0, 40) : `k_${base}`.slice(0, 40);
}

export type CategoryInput = {
  name_sq: string;
  description_sq: string;
  display_order: string;
  active: boolean;
};

function coerce(input: CategoryInput): { ok: true; value: {
  name_sq: string; description_sq: string | null; display_order: number; active: boolean;
} } | { ok: false; error: string } {
  const name = input.name_sq.trim();
  if (!name) return { ok: false, error: "Emri i kategorisë mungon." };
  if (name.length > 80) return { ok: false, error: "Emri është shumë i gjatë. Shkurtoje." };

  const rawOrder = (input.display_order ?? "").trim().replace(",", ".");
  let order = 0;
  if (rawOrder) {
    const parsed = Number(rawOrder);
    if (!Number.isFinite(parsed)) return { ok: false, error: "Renditja duhet të jetë numër i plotë." };
    order = Math.round(parsed);
    if (order < 0 || order > 9999) return { ok: false, error: "Renditja duhet të jetë mes 0 dhe 9999." };
  }

  return {
    ok: true,
    value: {
      name_sq: name,
      description_sq: input.description_sq.trim() || null,
      display_order: order,
      active: input.active,
    },
  };
}

export async function createCategory(input: CategoryInput): Promise<CategoryResult> {
  try {
    await assertAdmin();
    const coerced = coerce(input);
    if (!coerced.ok) return coerced;

    const code = slugify(coerced.value.name_sq);
    if (!code) {
      return { ok: false, error: "Emri duhet të përmbajë së paku një shkronjë ose numër." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("expense_categories")
      .insert({ ...coerced.value, code } as never);
    if (error) {
      // 23505 on `code` — dbError says "ekziston tashmë", but the owner needs to
      // know WHICH field collided, since the code is derived silently.
      if (String(error.code) === "23505") {
        return { ok: false, error: "Ekziston tashmë një kategori me këtë emër." };
      }
      return { ok: false, error: dbError(error, "Krijimi i kategorisë dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Krijimi i kategorisë dështoi. Provo sërish.") };
  }
}

/**
 * Renames / reorders / retires one category. `code` is never touched: it is the
 * stable key the seed and any future migration match on, and rewriting it would
 * make a re-run of the migration insert a duplicate of a category the owner
 * merely renamed.
 */
export async function updateCategory(id: string, input: CategoryInput): Promise<CategoryResult> {
  try {
    await assertAdmin();
    if (!id) return { ok: false, error: "Kategoria nuk u gjet." };

    const coerced = coerce(input);
    if (!coerced.ok) return coerced;

    const supabase = await createClient();
    const { error } = await supabase
      .from("expense_categories")
      .update(coerced.value as never)
      .eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Ruajtja e kategorisë dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Ruajtja e kategorisë dështoi. Provo sërish.") };
  }
}

/**
 * Deletes a category that was never used. The FK is ON DELETE RESTRICT, so the
 * database would refuse anyway once an expense points at it — this checks first
 * so the answer is a sentence about the ledger, not a foreign key error.
 */
export async function deleteCategory(id: string): Promise<CategoryResult> {
  try {
    await assertAdmin();
    if (!id) return { ok: false, error: "Kategoria nuk u gjet." };

    const supabase = await createClient();
    const { count, error: countErr } = await supabase
      .from("club_expenses")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if (countErr) return { ok: false, error: dbError(countErr, "Kontrolli i kategorisë dështoi.") };
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `Kjo kategori përdoret nga ${count} shpenzime dhe nuk mund të fshihet — regjistri do të mbetej pa klasifikim. Çaktivizoje në vend të kësaj.`,
      };
    }

    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Fshirja e kategorisë dështoi. Provo sërish.") };
    }

    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e, "Fshirja e kategorisë dështoi. Provo sërish.") };
  }
}
