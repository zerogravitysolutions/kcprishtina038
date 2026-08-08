"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { detectRaceSignal } from "@/lib/race-detect";

const RACE_TYPES = ["road", "mtb", "tt", "stage", "gravel", "cyclocross"] as const;

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/, "");
}

function parsePayload(form: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const name        = String(form.get("name") || "").trim();          if (name) patch.name = name;
  const date        = String(form.get("race_date") || "").trim();     if (date) patch.race_date = date;
  const loc         = form.get("location");                            if (loc !== null) patch.location = String(loc).trim() || null;
  const tp          = String(form.get("race_type") || "").trim();
  if (tp && (RACE_TYPES as readonly string[]).includes(tp))            patch.race_type = tp;
  else if (tp === "")                                                  patch.race_type = null;
  const org         = form.get("organizer");                           if (org !== null) patch.organizer = String(org).trim() || null;
  const desc        = form.get("description");                         if (desc !== null) patch.description = String(desc).trim() || null;
  const result      = form.get("result_summary");                      if (result !== null) patch.result_summary = String(result).trim() || null;
  const ext         = form.get("external_url");                        if (ext !== null) patch.external_url = String(ext).trim() || null;
  const cov         = form.get("cover_media_id");
  if (cov !== null) { const v = String(cov).trim(); patch.cover_media_id = v === "" ? null : v; }
  const gal         = form.get("gallery_media_ids");
  if (gal !== null) {
    // Stored as a comma-separated hidden input; parse into a uuid[].
    patch.gallery_media_ids = String(gal).split(",").map((s) => s.trim()).filter(Boolean);
  }
  const ord         = form.get("display_order");
  if (ord !== null && String(ord).trim() !== "") {
    const n = parseInt(String(ord), 10); if (!isNaN(n)) patch.display_order = n;
  }
  return patch;
}

export async function createRaceEvent(form: FormData): Promise<void> {
  await assertEditor();
  const payload = parsePayload(form);
  if (!payload.name) throw new Error("Emri i garës mungon.");
  if (!payload.race_date) throw new Error("Data e garës mungon.");
  const supabase = await createClient();

  // Auto-generate unique slug if not provided.
  const customSlug = String(form.get("slug") || "").trim();
  let slug = customSlug ? slugify(customSlug) : slugify(`${payload.name} ${String(payload.race_date).slice(0, 4)}`);
  if (!slug) throw new Error("Emri nuk gjeneron URL të vlefshme.");
  let suffix = 1, candidate = slug;
  for (;;) {
    const { data: existing } = await supabase.from("race_events").select("id").eq("slug", candidate).maybeSingle();
    if (!existing) { slug = candidate; break; }
    suffix++; candidate = `${slug}-${suffix}`;
  }
  payload.slug = slug;

  const { data: inserted, error } = await supabase
    .from("race_events")
    .insert([payload] as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Optional: link a news row to this newly created race.
  const linkNewsId = String(form.get("link_news_id") || "").trim();
  if (linkNewsId && inserted) {
    const newRaceId = (inserted as { id: string }).id;
    await supabase.from("news").update({ race_event_id: newRaceId } as never).eq("id", linkNewsId);
    revalidatePath(`/admin/news/${linkNewsId}`);
  }

  revalidatePath("/admin/races");
  revalidatePath("/races");
  redirect("/admin/races");
}

export async function updateRaceEvent(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("race_events").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/races");
  revalidatePath("/races");
  redirect("/admin/races");
}

// ---------- Facebook race suggestions (approve / decline) ----------

type NewsForRace = {
  id: string; title_sq: string | null; body_sq: string | null; published_at: string | null;
  gallery_media_ids: string[] | null; cover_media_id: string | null; external_url: string | null;
  race_event_id: string | null;
};

/** APPROVE a suggested FB post → create a race_event from it and link the post. */
export async function approveRaceSuggestion(newsId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { data: n } = await supabase
      .from("news")
      .select("id, title_sq, body_sq, published_at, gallery_media_ids, cover_media_id, external_url, race_event_id")
      .eq("id", newsId).maybeSingle();
    const post = n as NewsForRace | null;
    if (!post) return { ok: false, error: "Postimi nuk u gjet." };
    if (post.race_event_id) return { ok: false, error: "Tashmë e lidhur me një garë." };

    const name = (detectRaceSignal({ title: post.title_sq ?? "", body: post.body_sq ?? "" }).nameGuess
      || post.title_sq || "Garë").trim().slice(0, 120);
    const race_date = (post.published_at ?? new Date().toISOString()).slice(0, 10);

    // Unique slug from name + year.
    let slug = slugify(`${name} ${race_date.slice(0, 4)}`);
    if (!slug) slug = `gare-${race_date}`;
    for (let suffix = 1, candidate = slug; ; suffix++) {
      const { data: exists } = await supabase.from("race_events").select("id").eq("slug", candidate).maybeSingle();
      if (!exists) { slug = candidate; break; }
      candidate = `${slug}-${suffix + 1}`;
    }

    const { data: inserted, error } = await supabase.from("race_events").insert([{
      slug, name, race_date,
      description: post.body_sq?.trim() || null,
      external_url: post.external_url || null,
      cover_media_id: post.cover_media_id || null,
      gallery_media_ids: post.gallery_media_ids ?? [],
    }] as never).select("id").single();
    if (error || !inserted) return { ok: false, error: error?.message ?? "Krijimi dështoi." };

    await supabase.from("news").update({ race_event_id: (inserted as { id: string }).id } as never).eq("id", newsId);
    revalidatePath("/admin/races");
    revalidatePath("/races");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** DECLINE a suggested FB post → it stops being suggested. */
export async function declineRaceSuggestion(newsId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("news").update({ race_dismissed: true } as never).eq("id", newsId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/races");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRaceEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("race_events").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/races");
    revalidatePath("/races");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
