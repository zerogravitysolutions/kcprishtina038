"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

export async function updateSection(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  const ns = String(form.get("name_sq") || "").trim();   if (ns) patch.name_sq = ns;
  const ds = form.get("description_sq"); if (ds !== null) patch.description_sq = String(ds).trim() || null;
  const co = form.get("coach_id");       if (co !== null) {
    const v = String(co).trim();
    patch.coach_id = v === "" ? null : v;
  }
  const ord = form.get("display_order"); if (ord !== null && String(ord).trim() !== "") {
    const n = parseInt(String(ord), 10); if (!isNaN(n)) patch.display_order = n;
  }
  patch.active = String(form.get("active") || "off") === "on";

  const { error } = await supabase.from("sections").update(patch as never).eq("id", id);
  if (error) throw new Error(dbError(error, "Ruajtja e seksionit dështoi. Provo sërish."));
  revalidatePath("/admin/sections");
  revalidatePath("/sections");
  redirect("/admin/sections");
}
