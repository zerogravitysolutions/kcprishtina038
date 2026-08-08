"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

export type UploadResult =
  | { ok: true; ids: string[]; skipped: number }
  | { ok: false; error: string };

/**
 * Bulk-upload images into the `media` bucket under `manual/<uuid>.<ext>`
 * and insert a corresponding `public.media` row per file. Returns the
 * IDs of the newly-inserted rows so the caller can auto-select them in
 * the picker.
 *
 * Permission: admin or editor (matches the storage policy
 * "media editor write" from migration 0009).
 */
export async function uploadMediaFiles(form: FormData): Promise<UploadResult> {
  try {
    const me = await getProfile();
    if (!me || !["admin", "editor"].includes(me.role)) {
      return { ok: false, error: "Nuk ke leje — vetëm admini ose redaktori mund të ngarkojë skedarë." };
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return { ok: false, error: "Nuk u zgjodh asnjë skedar." };

    const supabase = await createClient();
    const ids: string[] = [];
    let skipped = 0;
    let lastErr: string | null = null;

    for (const file of files) {
      if (!ALLOWED_MIME.has(file.type)) { skipped++; continue; }
      if (file.size <= 0 || file.size > MAX_BYTES) { skipped++; continue; }

      const path = `manual/${crypto.randomUUID()}.${extFor(file.type)}`;
      const buf = await file.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, buf, { contentType: file.type, upsert: false });
      if (upErr) { lastErr = dbError(upErr, "Ngarkimi i skedarit dështoi. Provo sërish."); skipped++; continue; }

      const row: Record<string, unknown> = {
        storage_path: path,
        filename: file.name || `${crypto.randomUUID()}.${extFor(file.type)}`,
        mime_type: file.type,
        byte_size: file.size,
        source: "upload",
        uploaded_by: me.id,
      };
      const { data: inserted, error: dbErr } = await supabase
        .from("media")
        // Cast through unknown: generated Database types don't cover the
        // `media` table since it's outside the typed surface, but the row
        // shape above is correct.
        .insert(row as never)
        .select("id")
        .single<{ id: string }>();

      if (dbErr) {
        // Roll back the storage object if the row failed.
        await supabase.storage.from("media").remove([path]).catch(() => {});
        lastErr = dbError(dbErr, "Ruajtja e skedarit dështoi. Provo sërish.");
        skipped++;
        continue;
      }
      if (inserted?.id) ids.push(inserted.id);
    }

    if (ids.length === 0 && lastErr) {
      return { ok: false, error: lastErr };
    }

    revalidatePath("/admin/media");
    // Picker hosts revalidate themselves via router.refresh() after the call.
    return { ok: true, ids, skipped };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
