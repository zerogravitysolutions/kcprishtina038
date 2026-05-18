"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

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
