"use server";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import type { TableInsert } from "@/lib/supabase/types";

export type JoinResult = { ok: true } | { ok: false; error: string };

const SECTION_SLUGS = ["road","mtb","gravel","track","youth","women","unsure"] as const;
const EXP = ["beginner","intermediate","advanced"] as const;

const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function safeExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png")  return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function submitApplication(form: FormData): Promise<JoinResult> {
  const gotcha = String(form.get("_gotcha") ?? "").trim();
  if (gotcha) return { ok: true }; // bot — silently succeed

  const name       = String(form.get("name")       ?? "").trim();
  const email      = String(form.get("email")      ?? "").trim();
  const phone      = String(form.get("phone")      ?? "").trim();
  const dobRaw     = String(form.get("dob") ?? "").trim();
  const section    = String(form.get("section")    ?? "").trim();
  const experience = String(form.get("experience") ?? "").trim();
  const notes      = String(form.get("notes")      ?? "").trim();
  const plan       = String(form.get("plan")       ?? "").trim();

  // Derive age (in full years) from DOB so the existing `applications.age`
  // column keeps a numeric value for filtering / federation forms.
  let age: number | null = null;
  let dob: string | null = null;
  if (dobRaw) {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Data e lindjes nuk është e vlefshme." };
    }
    const today = new Date();
    let yrs = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) yrs--;
    if (yrs < 9 || yrs > 80) {
      return { ok: false, error: "Mosha (e llogaritur nga data e lindjes) duhet të jetë midis 9 dhe 80 vjeç." };
    }
    age = yrs;
    dob = dobRaw;
  }

  if (!name) return { ok: false, error: "Emri është i detyrueshëm." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };
  if (!dob) return { ok: false, error: "Data e lindjes është e detyrueshme." };

  const supabase = await createClient();

  // Resolve section_id if applicant picked a known slug.
  let sectionId: string | null = null;
  if (section && section !== "unsure" && (SECTION_SLUGS as readonly string[]).includes(section)) {
    const { data: sec } = await supabase.from("sections").select("id").eq("slug", section).maybeSingle();
    sectionId = (sec as { id: string } | null)?.id ?? null;
  }

  // Resolve the chosen academy tier against the plans that actually exist, so
  // the posted code is never trusted. If the catalogue is empty or unreadable
  // (e.g. the migration has not run yet) the picker was not rendered either,
  // and the application goes through without a plan rather than failing.
  let planId: string | null = null;
  const { data: planRows } = await supabase
    .from("membership_plans")
    .select("id, code")
    .eq("active", true);
  const plans = (planRows as { id: string; code: string }[] | null) ?? [];
  if (plans.length > 0) {
    const match = plans.find((p) => p.code === plan);
    if (!match) return { ok: false, error: "Zgjidh një plan anëtarësie." };
    planId = match.id;
  }

  // Optional profile photo: validate and upload to media/applications/ before
  // we insert the application row, so the row carries the storage path.
  let photoStoragePath: string | null = null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_PHOTO_MIME.has(file.type)) {
      return { ok: false, error: "Fotoja duhet të jetë JPG, PNG ose WebP." };
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "Fotoja e kalon kufirin prej 5 MB." };
    }
    const ext = safeExt(file.type);
    const path = `applications/${randomId()}.${ext}`;
    const buf = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: dbError(upErr, "Ngarkimi i fotos dështoi. Provo sërish.") };
    photoStoragePath = path;
  }

  const row: TableInsert<"applications"> = {
    full_name: name,
    email,
    phone: phone || null,
    age,
    dob,
    section_id: sectionId,
    experience: (EXP as readonly string[]).includes(experience) ? experience : null,
    notes: notes || null,
    photo_storage_path: photoStoragePath,
  };
  // Only sent when a plan was resolved, so the insert still works against a
  // database where applications.plan_id does not exist yet.
  if (planId) row.plan_id = planId;
  const { error } = await supabase
    .from("applications")
    .insert(row);
  if (error) {
    // If the row insert failed but we already uploaded a photo, try to clean it up
    if (photoStoragePath) {
      await supabase.storage.from("media").remove([photoStoragePath]).catch(() => {});
    }
    return { ok: false, error: dbError(error, "Dërgimi i aplikimit dështoi. Provo sërish.") };
  }
  return { ok: true };
}
