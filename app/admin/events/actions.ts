"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor", "coach"].includes(p.role)) throw new Error("forbidden");
  return p;
}

function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/, "");
}

function parsePayload(form: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const t   = String(form.get("title_sq") || "").trim();   if (t) patch.title_sq = t;
  const te  = form.get("title_en");      if (te !== null) patch.title_en = String(te).trim() || null;
  const tp  = String(form.get("type") || "").trim();       if (tp) patch.type = tp;
  const st  = String(form.get("status") || "").trim();     if (st) patch.status = st;
  const sec = form.get("section_id");    if (sec !== null) { const v = String(sec).trim(); patch.section_id = v === "" ? null : v; }
  const sa  = String(form.get("start_at") || "").trim();   if (sa) patch.start_at = new Date(sa).toISOString();
  const ea  = form.get("end_at");        if (ea !== null) { const v = String(ea).trim(); patch.end_at = v ? new Date(v).toISOString() : null; }
  const loc = form.get("location");      if (loc !== null) patch.location = String(loc).trim() || null;
  const dk  = form.get("distance_km");   if (dk !== null && String(dk).trim() !== "") {
    const n = parseFloat(String(dk)); if (!isNaN(n)) patch.distance_km = n;
  } else if (dk !== null) patch.distance_km = null;
  const el  = form.get("elevation_m");   if (el !== null && String(el).trim() !== "") {
    const n = parseInt(String(el), 10); if (!isNaN(n)) patch.elevation_m = n;
  } else if (el !== null) patch.elevation_m = null;
  const ds  = form.get("description_sq"); if (ds !== null) patch.description_sq = String(ds).trim() || null;
  const de  = form.get("description_en"); if (de !== null) patch.description_en = String(de).trim() || null;
  const cov = form.get("cover_media_id"); if (cov !== null) { const v = String(cov).trim(); patch.cover_media_id = v === "" ? null : v; }
  const sv  = form.get("strava_url");     if (sv  !== null) { const v = String(sv).trim();  patch.strava_url     = v === "" ? null : v; }
  return patch;
}

// ----- Per-event sponsors -------------------------------------------------

export async function setEventSponsors(
  eventId: string,
  sponsorIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    // Replace the full set: delete existing, insert the new (ordered) list.
    const { error: delErr } = await supabase
      .from("event_sponsors")
      .delete()
      .eq("event_id", eventId);
    if (delErr) return { ok: false, error: delErr.message };

    if (sponsorIds.length > 0) {
      const rows = sponsorIds.map((sid, i) => ({
        event_id: eventId,
        sponsor_id: sid,
        display_order: i,
      }));
      const { error: insErr } = await supabase
        .from("event_sponsors")
        .insert(rows as never);
      if (insErr) return { ok: false, error: insErr.message };
    }
    revalidatePath(`/admin/events/${eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createEvent(form: FormData): Promise<void> {
  const me = await assertEditor();
  const payload = parsePayload(form);
  if (!payload.title_sq) throw new Error("Titulli mungon.");
  if (!payload.type)     throw new Error("Tipi mungon.");
  if (!payload.start_at) throw new Error("Data e fillimit mungon.");
  const supabase = await createClient();

  let slug = slugify(payload.title_sq as string);
  if (slug) {
    let suffix = 1, candidate = slug;
    for (;;) {
      const { data: existing } = await supabase.from("events").select("id").eq("slug", candidate).maybeSingle();
      if (!existing) { slug = candidate; break; }
      suffix++; candidate = `${slug}-${suffix}`;
    }
    payload.slug = slug;
  }
  payload.created_by = me.id;
  payload.source = "native";

  const { error } = await supabase.from("events").insert([payload] as never);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function updateEvent(id: string, form: FormData): Promise<void> {
  await assertEditor();
  const supabase = await createClient();
  const patch = parsePayload(form);
  const { error } = await supabase.from("events").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function deleteEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/events");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ----- Event categories ---------------------------------------------------
// Replaces the full set of categories tied to the event in one call. The
// admin UI is a checkbox grid driven by lib/race-category.ts, so we
// store the human-readable label as `name` (matches `event_signups.category`
// values via CATEGORIES[].v / .label).

export async function setEventCategories(
  eventId: string,
  rows: { name: string; max_riders: number | null; display_order: number }[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();

    const { error: delErr } = await supabase
      .from("event_categories")
      .delete()
      .eq("event_id", eventId);
    if (delErr) return { ok: false, error: delErr.message };

    if (rows.length > 0) {
      const payload = rows.map((r) => ({
        event_id: eventId,
        name: r.name,
        max_riders: r.max_riders,
        display_order: r.display_order,
      }));
      const { error: insErr } = await supabase
        .from("event_categories")
        .insert(payload as never);
      if (insErr) return { ok: false, error: insErr.message };
    }
    revalidatePath(`/admin/events/${eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
