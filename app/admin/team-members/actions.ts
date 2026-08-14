"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { ORDER_FIELD, parseNumField } from "@/lib/numeric";
import { slugifyName, uniqueSlug } from "@/lib/slug";
import type { TableInsert, TableUpdate, TeamPosition } from "@/lib/supabase/types";

// Mirrors public.team_position; typed against the column union so a value
// dropped from (or added to) the enum is a compile error here.
const POSITIONS: readonly TeamPosition[] = [
  "president", "board_member",
  "secretary_general", "secretary_organizational",
  "commissaire", "coach", "rider", "mechanic", "physio", "staff",
];

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function parsePayload(form: FormData): TableUpdate<"team_members"> {
  const patch: TableUpdate<"team_members"> = {};
  const first = String(form.get("first_name") || "").trim();
  const last  = String(form.get("last_name")  || "").trim();
  if (first) patch.first_name = first;
  if (last)  patch.last_name  = last;
  if (first || last) patch.full_name = `${first} ${last}`.trim();
  const dob = form.get("dob");      if (dob !== null) { const v = String(dob).trim(); patch.dob = v || null; }
  // Fixed <select>; team_gender re-checks it server-side.
  const g   = form.get("gender");   if (g !== null)   { const v = String(g).trim();   patch.gender = v === "" ? null : (v as "m" | "f"); }
  const sec = form.get("section_slug"); if (sec !== null) { const v = String(sec).trim(); patch.section_slug = v === "" ? null : v; }
  const photo = form.get("photo_media_id"); if (photo !== null) { const v = String(photo).trim(); patch.photo_media_id = v === "" ? null : v; }
  const ext = form.get("external_photo_url"); if (ext !== null) patch.external_photo_url = String(ext).trim() || null;
  // Fixed <select>; team_status re-checks it server-side.
  const st  = String(form.get("status") || "").trim(); if (st) patch.status = st as "active" | "past";
  const ea  = form.get("ended_at"); if (ea !== null) { const v = String(ea).trim(); patch.ended_at = v || null; }
  const bio = form.get("bio");      if (bio !== null) patch.bio = String(bio).trim() || null;
  // type="text" + inputMode (see components/admin/NumericInput): the browser no
  // longer filters the value, so this is the only check on it.
  const ord = form.get("display_order");
  if (ord !== null && String(ord).trim() !== "") {
    patch.display_order = parseNumField(ord, ORDER_FIELD) ?? undefined;
  }
  const pid = form.get("profile_id"); if (pid !== null) { const v = String(pid).trim(); patch.profile_id = v === "" ? null : v; }
  const positions = form.getAll("positions").map(v => String(v)).filter((p): p is TeamPosition => (POSITIONS as readonly string[]).includes(p));
  if (positions.length) patch.positions = positions;
  // is_master is a checkbox — present in FormData only when checked.
  // Always write it so unchecking clears the flag.
  patch.is_master = String(form.get("is_master") || "off") === "on";
  return patch;
}

export async function createTeamMember(form: FormData): Promise<void> {
  await assertEditor();
  const fields = parsePayload(form);
  if (!fields.first_name) throw new Error("Emri mungon.");
  if (!fields.last_name)  throw new Error("Mbiemri mungon.");
  if (!fields.positions || fields.positions.length === 0) {
    throw new Error("Zgjidh së paku një pozicion.");
  }
  const supabase = await createClient();
  // Shared with the enrolment path and /admin/people so every insert produces a
  // slug the column's own check constraint accepts (must START with a letter).
  const base = slugifyName(`${fields.first_name} ${fields.last_name}`);
  const payload: TableInsert<"team_members"> = {
    ...fields,
    first_name: fields.first_name,
    last_name: fields.last_name,
    full_name: fields.full_name ?? `${fields.first_name} ${fields.last_name}`.trim(),
    positions: fields.positions,
    status: fields.status ?? "active",
    slug: await uniqueSlug(base, async (candidate) => {
      const { data } = await supabase.from("team_members").select("id").eq("slug", candidate).maybeSingle();
      return !!data;
    }),
  };
  const { error } = await supabase.from("team_members").insert([payload]);
  if (error) throw new Error(dbError(error, "Ruajtja e anëtarit dështoi. Provo sërish."));
  revalidatePath("/admin/people");
  revalidatePath("/team");
  redirect("/admin/people");
}

export async function updateTeamMember(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("team_members").update(patch).eq("id", id);
  if (error) throw new Error(dbError(error, "Ruajtja e anëtarit dështoi. Provo sërish."));
  revalidatePath("/admin/people");
  revalidatePath("/team");
  redirect("/admin/people");
}

export async function deleteTeamMember(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) return { ok: false, error: dbError(error, "Fshirja e anëtarit dështoi. Provo sërish.") };
    revalidatePath("/admin/people");
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
