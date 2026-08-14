"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import type { TableInsert, TableRow, TableUpdate } from "@/lib/supabase/types";

const RACE_TYPES: readonly NonNullable<TableRow<"race_events">["race_type"]>[] =
  ["road", "mtb", "tt", "stage", "gravel", "cyclocross"];

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/, "");
}

function parsePayload(form: FormData): TableUpdate<"race_events"> {
  const patch: TableUpdate<"race_events"> = {};
  const name        = String(form.get("name") || "").trim();          if (name) patch.name = name;
  const date        = String(form.get("race_date") || "").trim();     if (date) patch.race_date = date;
  const loc         = form.get("location");                            if (loc !== null) patch.location = String(loc).trim() || null;
  const tp          = String(form.get("race_type") || "").trim();
  // find() rather than includes() so the value narrows to the column type.
  const raceType    = RACE_TYPES.find((t) => t === tp);
  if (raceType)                                                        patch.race_type = raceType;
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
  const fields = parsePayload(form);
  if (!fields.name) throw new Error("Emri i garës mungon.");
  if (!fields.race_date) throw new Error("Data e garës mungon.");
  const supabase = await createClient();

  // Auto-generate unique slug if not provided.
  const customSlug = String(form.get("slug") || "").trim();
  let slug = customSlug ? slugify(customSlug) : slugify(`${fields.name} ${fields.race_date.slice(0, 4)}`);
  if (!slug) throw new Error("Nga ky emër nuk del një URL e vlefshme. Përdor së paku një shkronjë ose numër.");
  let suffix = 1, candidate = slug;
  for (;;) {
    const { data: existing } = await supabase.from("race_events").select("id").eq("slug", candidate).maybeSingle();
    if (!existing) { slug = candidate; break; }
    suffix++; candidate = `${slug}-${suffix}`;
  }
  const payload: TableInsert<"race_events"> = {
    ...fields,
    name: fields.name,
    race_date: fields.race_date,
    slug,
  };

  const { data: inserted, error } = await supabase
    .from("race_events")
    .insert([payload])
    .select("id")
    .single();
  if (error) throw new Error(dbError(error, "Krijimi i garës dështoi. Provo sërish."));

  // Optional: link a news row to this newly created race.
  const linkNewsId = String(form.get("link_news_id") || "").trim();
  if (linkNewsId && inserted) {
    const newRaceId = (inserted as { id: string }).id;
    await supabase.from("news").update({ race_event_id: newRaceId }).eq("id", linkNewsId);
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
  const { error } = await supabase.from("race_events").update(patch).eq("id", id);
  if (error) throw new Error(dbError(error, "Ruajtja e garës dështoi. Provo sërish."));
  revalidatePath("/admin/races");
  revalidatePath("/races");
  redirect("/admin/races");
}

// ---------- Facebook race suggestions ----------
// APPROVE is a link to the pre-filled /admin/races/new form (so the editor
// confirms the real race date + results before it goes public) — see
// app/admin/races/page.tsx. Only DECLINE is an action.

/** DECLINE a suggested FB post → it stops being suggested. */
export async function declineRaceSuggestion(newsId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("news").update({ race_dismissed: true }).eq("id", newsId);
    if (error) return { ok: false, error: dbError(error, "Refuzimi i sugjerimit dështoi. Provo sërish.") };
    revalidatePath("/admin/races");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function deleteRaceEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("race_events").delete().eq("id", id);
    if (error) return { ok: false, error: dbError(error, "Fshirja e garës dështoi. Provo sërish.") };
    revalidatePath("/admin/races");
    revalidatePath("/races");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
