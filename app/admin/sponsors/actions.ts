"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function parsePayload(form: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const name = String(form.get("name") || "").trim();   if (name) patch.name = name;
  const tier = String(form.get("tier") || "").trim();   if (tier) patch.tier = tier;
  const rs = form.get("role_sq");      if (rs !== null) patch.role_sq = String(rs).trim() || null;
  const re = form.get("role_en");      if (re !== null) patch.role_en = String(re).trim() || null;
  const bs = form.get("body_sq");      if (bs !== null) patch.body_sq = String(bs).trim() || null;
  const be = form.get("body_en");      if (be !== null) patch.body_en = String(be).trim() || null;
  const url = form.get("website_url"); if (url !== null) patch.website_url = String(url).trim() || null;
  const cs = form.get("contract_start"); if (cs !== null) patch.contract_start = String(cs).trim() || null;
  const ce = form.get("contract_end");   if (ce !== null) patch.contract_end = String(ce).trim() || null;
  const ord = form.get("display_order"); if (ord !== null && String(ord).trim() !== "") {
    const n = parseInt(String(ord), 10); if (!isNaN(n)) patch.display_order = n;
  }
  patch.active = String(form.get("active") || "off") === "on";
  const logo = form.get("logo_media_id");
  if (logo !== null) { const v = String(logo).trim(); patch.logo_media_id = v === "" ? null : v; }
  return patch;
}

export async function createSponsor(form: FormData): Promise<void> {
  await assertEditor();
  const payload = parsePayload(form);
  if (!payload.name) throw new Error("Emri mungon.");
  if (!payload.tier) throw new Error("Niveli mungon.");
  const supabase = await createClient();
  const { error } = await supabase.from("sponsors").insert([payload] as never);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/sponsors");
  revalidatePath("/");
  redirect("/admin/sponsors");
}

export async function updateSponsor(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("sponsors").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/sponsors");
  revalidatePath("/");
  redirect("/admin/sponsors");
}

export async function deleteSponsor(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("sponsors").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/sponsors");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
