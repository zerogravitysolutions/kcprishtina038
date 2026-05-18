"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor", "coach"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function parsePayload(form: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const eid = String(form.get("event_id") || "").trim();   if (eid) patch.event_id = eid;
  const cid = form.get("category_id");   if (cid !== null) { const v = String(cid).trim(); patch.category_id = v === "" ? null : v; }
  const mid = form.get("member_id");     if (mid !== null) { const v = String(mid).trim(); patch.member_id = v === "" ? null : v; }
  const ov  = form.get("rider_name_override"); if (ov !== null) patch.rider_name_override = String(ov).trim() || null;
  const pos = form.get("position");      if (pos !== null && String(pos).trim() !== "") {
    const n = parseInt(String(pos), 10); if (!isNaN(n)) patch.position = n;
  } else if (pos !== null) patch.position = null;
  const ts  = form.get("time_seconds");  if (ts !== null && String(ts).trim() !== "") {
    const n = parseInt(String(ts), 10); if (!isNaN(n)) patch.time_seconds = n;
  } else if (ts !== null) patch.time_seconds = null;
  const pts = form.get("points");        if (pts !== null && String(pts).trim() !== "") {
    const n = parseInt(String(pts), 10); if (!isNaN(n)) patch.points = n;
  } else if (pts !== null) patch.points = null;
  const nt  = form.get("notes");         if (nt !== null) patch.notes = String(nt).trim() || null;
  return patch;
}

export async function createResult(form: FormData): Promise<void> {
  const me = await assertEditor();
  const payload = parsePayload(form);
  if (!payload.event_id) throw new Error("Eventi mungon.");
  if (!payload.member_id && !payload.rider_name_override) {
    throw new Error("Zgjidh një anëtar ose vendos emrin e çiklistit.");
  }
  payload.recorded_by = me.id;
  const supabase = await createClient();
  const { error } = await supabase.from("results").insert([payload] as never);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/results");
  redirect("/admin/results");
}

export async function updateResult(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("results").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/results");
  redirect("/admin/results");
}

export async function deleteResult(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("results").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/results");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
