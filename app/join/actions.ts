"use server";
import { createClient } from "@/lib/supabase/server";

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

  // Optional profile photo: validate and upload to media/applications/ before
  // we insert the application row, so the row carries the storage path.
  let photoStoragePath: string | null = null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_PHOTO_MIME.has(file.type)) {
      return { ok: false, error: "Foto duhet të jetë JPG, PNG ose WebP." };
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "Foto kalon kufirin prej 5 MB." };
    }
    const ext = safeExt(file.type);
    const path = `applications/${randomId()}.${ext}`;
    const buf = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: `Ngarkimi i fotos dështoi: ${upErr.message}` };
    photoStoragePath = path;
  }

  const row: Record<string, unknown> = {
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
  const { error } = await supabase
    .from("applications")
    .insert(row as never);
  if (error) {
    // If the row insert failed but we already uploaded a photo, try to clean it up
    if (photoStoragePath) {
      await supabase.storage.from("media").remove([photoStoragePath]).catch(() => {});
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
