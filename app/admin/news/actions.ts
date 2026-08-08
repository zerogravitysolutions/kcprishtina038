"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

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

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

export async function createNews(form: FormData): Promise<void> {
  const me = await assertEditor();
  const title_sq = String(form.get("title_sq") || "").trim();
  const title_en = String(form.get("title_en") || "").trim() || null;
  const body_sq  = String(form.get("body_sq")  || "").trim();
  const body_en  = String(form.get("body_en")  || "").trim() || null;
  const status   = String(form.get("status")   || "draft");
  const tags     = String(form.get("tags")     || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!title_sq) throw new Error("Titulli mungon.");
  if (!body_sq)  throw new Error("Përmbajtja mungon.");

  const supabase = await createClient();
  let slug = slugify(title_sq);
  if (!slug) throw new Error("Titulli nuk gjeneron një URL të vlefshme.");
  let suffix = 1, candidate = slug;
  for (;;) {
    const { data: existing } = await supabase.from("news").select("id").eq("slug", candidate).maybeSingle();
    if (!existing) { slug = candidate; break; }
    suffix++;
    candidate = `${slug}-${suffix}`;
  }

  const cover = String(form.get("cover_media_id") || "").trim();
  const galleryRaw = String(form.get("gallery_media_ids") || "").trim();
  const gallery = galleryRaw ? galleryRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const payload: Record<string, unknown> = {
    slug, title_sq, title_en, body_sq, body_en, status, tags,
    author_id: me.id, source: "manual",
    cover_media_id: cover || null,
    gallery_media_ids: gallery,
  };
  if (status === "published") payload.published_at = new Date().toISOString();

  const { error } = await supabase.from("news").insert([payload] as never);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/news");
  revalidatePath("/news");
  redirect("/admin/news");
}

export async function updateNews(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  const t = String(form.get("title_sq") || "").trim();
  if (t) patch.title_sq = t;
  const te = form.get("title_en");
  if (te !== null) patch.title_en = String(te).trim() || null;
  const b = String(form.get("body_sq") || "").trim();
  if (b) patch.body_sq = b;
  const be = form.get("body_en");
  if (be !== null) patch.body_en = String(be).trim() || null;
  const s = String(form.get("status") || "").trim();
  if (s) {
    patch.status = s;
    if (s === "published") {
      const { data: existing } = await supabase.from("news").select("published_at").eq("id", id).maybeSingle();
      if (!(existing as { published_at: string | null } | null)?.published_at) {
        patch.published_at = new Date().toISOString();
      }
    }
  }
  const tagsRaw = form.get("tags");
  if (tagsRaw !== null) patch.tags = String(tagsRaw).split(",").map(s => s.trim()).filter(Boolean);
  const cover = form.get("cover_media_id");
  if (cover !== null) {
    const v = String(cover).trim();
    patch.cover_media_id = v === "" ? null : v;
  }
  const galleryRaw = form.get("gallery_media_ids");
  if (galleryRaw !== null) {
    const v = String(galleryRaw).trim();
    patch.gallery_media_ids = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }

  const { error } = await supabase.from("news").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/news");
  revalidatePath("/news");
  redirect("/admin/news");
}

export async function deleteNews(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/news");
    revalidatePath("/news");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
