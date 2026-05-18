"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

const POSITIONS = [
  "president", "secretary_general", "secretary_organizational",
  "commissaire", "coach", "rider", "mechanic", "physio", "staff",
] as const;
type Position = (typeof POSITIONS)[number];

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-+$/, "");
}

function parsePayload(form: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const first = String(form.get("first_name") || "").trim();
  const last  = String(form.get("last_name")  || "").trim();
  if (first) patch.first_name = first;
  if (last)  patch.last_name  = last;
  if (first || last) patch.full_name = `${first} ${last}`.trim();
  const dob = form.get("dob");      if (dob !== null) { const v = String(dob).trim(); patch.dob = v || null; }
  const g   = form.get("gender");   if (g !== null)   { const v = String(g).trim();   patch.gender = v === "" ? null : v; }
  const sec = form.get("section_slug"); if (sec !== null) { const v = String(sec).trim(); patch.section_slug = v === "" ? null : v; }
  const photo = form.get("photo_media_id"); if (photo !== null) { const v = String(photo).trim(); patch.photo_media_id = v === "" ? null : v; }
  const ext = form.get("external_photo_url"); if (ext !== null) patch.external_photo_url = String(ext).trim() || null;
  const st  = String(form.get("status") || "").trim(); if (st) patch.status = st;
  const ea  = form.get("ended_at"); if (ea !== null) { const v = String(ea).trim(); patch.ended_at = v || null; }
  const bio = form.get("bio");      if (bio !== null) patch.bio = String(bio).trim() || null;
  const ord = form.get("display_order"); if (ord !== null && String(ord).trim() !== "") {
    const n = parseInt(String(ord), 10); if (!isNaN(n)) patch.display_order = n;
  }
  const pid = form.get("profile_id"); if (pid !== null) { const v = String(pid).trim(); patch.profile_id = v === "" ? null : v; }
  const positions = form.getAll("positions").map(v => String(v)).filter((p): p is Position => (POSITIONS as readonly string[]).includes(p));
  if (positions.length) patch.positions = positions;
  // is_master is a checkbox — present in FormData only when checked.
  // Always write it so unchecking clears the flag.
  patch.is_master = String(form.get("is_master") || "off") === "on";
  return patch;
}

export async function createTeamMember(form: FormData): Promise<void> {
  await assertEditor();
  const payload = parsePayload(form);
  if (!payload.first_name) throw new Error("Emri mungon.");
  if (!payload.last_name)  throw new Error("Mbiemri mungon.");
  if (!Array.isArray(payload.positions) || (payload.positions as string[]).length === 0) {
    throw new Error("Zgjidh së paku një pozicion.");
  }
  const supabase = await createClient();
  let slug = slugify(`${payload.first_name} ${payload.last_name}`);
  if (!slug) throw new Error("Emri nuk gjeneron URL të vlefshme.");
  let suffix = 1, candidate = slug;
  for (;;) {
    const { data: existing } = await supabase.from("team_members").select("id").eq("slug", candidate).maybeSingle();
    if (!existing) { slug = candidate; break; }
    suffix++; candidate = `${slug}-${suffix}`;
  }
  payload.slug = slug;
  payload.status = payload.status ?? "active";
  const { error } = await supabase.from("team_members").insert([payload] as never);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team-members");
  revalidatePath("/team");
  redirect("/admin/team-members");
}

export async function updateTeamMember(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("team_members").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team-members");
  revalidatePath("/team");
  redirect("/admin/team-members");
}

export async function deleteTeamMember(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/team-members");
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
