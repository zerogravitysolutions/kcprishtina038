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
  const ageRaw     = form.get("age");
  const age        = ageRaw === null || String(ageRaw).trim() === "" ? null : Number(ageRaw);
  const section    = String(form.get("section")    ?? "").trim();
  const experience = String(form.get("experience") ?? "").trim();
  const notes      = String(form.get("notes")      ?? "").trim();

  if (!name) return { ok: false, error: "Emri është i detyrueshëm." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };
  if (age !== null && (Number.isNaN(age) || age < 9 || age > 80)) {
    return { ok: false, error: "Mosha duhet të jetë midis 9 dhe 80." };
  }

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

  const insertFn = supabase.from("applications").insert as unknown as (
    row: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await insertFn({
    full_name: name,
    email,
    phone: phone || null,
    age,
    section_id: sectionId,
    experience: (EXP as readonly string[]).includes(experience) ? experience : null,
    notes: notes || null,
    photo_storage_path: photoStoragePath,
  });
  if (error) {
    // If the row insert failed but we already uploaded a photo, try to clean it up
    if (photoStoragePath) {
      await supabase.storage.from("media").remove([photoStoragePath]).catch(() => {});
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
