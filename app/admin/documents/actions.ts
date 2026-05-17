"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import type { DocumentCategory, DocumentVisibility } from "@/lib/supabase/documents";

const PDF_MIME = "application/pdf";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

async function assertAdmin() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) {
    throw new Error("forbidden");
  }
  return p;
}

export async function uploadDocument(form: FormData): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  try {
    const me = await assertAdmin();
    const file = form.get("file");
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "other") as DocumentCategory;
    const visibility = String(form.get("visibility") || "public") as DocumentVisibility;
    const description = String(form.get("description") || "").trim() || null;
    const effectiveDate = String(form.get("effective_date") || "").trim() || null;

    if (!(file instanceof File))   return { ok: false, error: "Asnjë skedar i ngarkuar." };
    if (!title)                    return { ok: false, error: "Titulli mungon." };
    if (file.type !== PDF_MIME && !file.name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, error: "Lejohen vetëm skedarët PDF." };
    }
    if (file.size === 0)           return { ok: false, error: "Skedari është bosh." };
    if (file.size > MAX_BYTES)     return { ok: false, error: `Skedari kalon ${MAX_BYTES / 1024 / 1024} MB.` };

    const supabase = await createClient();
    let slug = slugify(title);
    if (!slug) return { ok: false, error: "Titulli nuk gjeneron një URL të vlefshme." };

    // Uniquify slug if necessary (append -2, -3, …).
    let suffix = 1;
    let candidate = slug;
    for (;;) {
      const { data: existing } = await supabase
        .from("documents").select("id").eq("slug", candidate).maybeSingle();
      if (!existing) { slug = candidate; break; }
      suffix++;
      candidate = `${slug}-${suffix}`;
    }

    const storagePath = `docs/${slug}.pdf`;
    const ab = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(storagePath, ab, { contentType: PDF_MIME, upsert: false });
    if (upErr) return { ok: false, error: `Ngarkimi dështoi: ${upErr.message}` };

    // supabase-ssr's typed builder narrows `.from("documents").insert()`
    // to `never[]` when the Tables generic is forwarded through layers
    // it doesn't fully infer. We cast to a plain object payload — the
    // runtime is fine and the DB CHECK enforces shape.
    const { error: dbErr } = await supabase.from("documents").insert([{
      slug,
      title,
      category,
      storage_path: storagePath,
      filename: `${slug}.pdf`,
      mime_type: PDF_MIME,
      byte_size: file.size,
      description,
      effective_date: effectiveDate || null,
      visibility,
      uploaded_by: me.id,
    }] as never);
    if (dbErr) {
      // Roll back the storage upload.
      await supabase.storage.from("media").remove([storagePath]);
      return { ok: false, error: `DB: ${dbErr.message}` };
    }

    revalidatePath("/admin/documents");
    revalidatePath("/documents");
    return { ok: true, slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateDocument(id: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    const t = String(form.get("title") || "").trim();
    if (t) patch.title = t;
    const cat = String(form.get("category") || "").trim();
    if (cat) patch.category = cat;
    const vis = String(form.get("visibility") || "").trim();
    if (vis) patch.visibility = vis;
    const desc = form.get("description");
    if (desc !== null) patch.description = String(desc).trim() || null;
    const eff = form.get("effective_date");
    if (eff !== null) patch.effective_date = String(eff).trim() || null;
    const ord = form.get("display_order");
    if (ord !== null && String(ord).trim() !== "") {
      const n = parseInt(String(ord), 10);
      if (!isNaN(n)) patch.display_order = n;
    }
    const { error } = await supabase.from("documents").update(patch as never).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/documents");
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteDocument(id: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error: dbErr } = await supabase.from("documents").delete().eq("id", id);
    if (dbErr) return { ok: false, error: dbErr.message };
    await supabase.storage.from("media").remove([storagePath]);
    revalidatePath("/admin/documents");
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
