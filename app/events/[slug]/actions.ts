"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateCategoryChoice, type Gender } from "@/lib/race-category";
import { dbError } from "@/lib/errors";

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerForEvent(slug: string, form: FormData): Promise<RegisterResult> {
  const gotcha = String(form.get("_gotcha") ?? "").trim();
  if (gotcha) return { ok: true }; // bot silently succeeds

  const full_name = String(form.get("full_name") ?? "").trim();
  const email     = String(form.get("email") ?? "").trim().toLowerCase();
  const phone     = String(form.get("phone") ?? "").trim();
  const dobRaw    = String(form.get("dob") ?? "").trim();
  const genderRaw = String(form.get("gender") ?? "").trim().toLowerCase();
  const category  = String(form.get("category") ?? "").trim();
  const club      = String(form.get("club") ?? "").trim();
  const notes     = String(form.get("notes") ?? "").trim();

  if (!full_name) return { ok: false, error: "Emri është i detyrueshëm." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Email-i nuk është i vlefshëm." };
  }

  let dob: string | null = null;
  if (dobRaw) {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Data e lindjes nuk është e vlefshme." };
    }
    dob = dobRaw;
  }
  if (!dob) return { ok: false, error: "Data e lindjes është e detyrueshme." };

  const gender: Gender | null =
    genderRaw === "m" || genderRaw === "f" || genderRaw === "other" ? (genderRaw as Gender) : null;
  if (!gender) return { ok: false, error: "Gjinia është e detyrueshme." };

  const supabase = await createClient();

  // Resolve the event id by slug (only published events can be signed up for).
  const { data: ev } = await supabase
    .from("events")
    .select("id, status, start_at, registration_close_at")
    .eq("slug", slug)
    .maybeSingle();
  const event = ev as { id: string; status: string; start_at: string; registration_close_at: string | null } | null;
  if (!event) return { ok: false, error: "Gara nuk u gjet." };
  if (event.status !== "published") {
    return { ok: false, error: "Regjistrimi për këtë garë nuk është i hapur." };
  }
  if (event.registration_close_at && new Date(event.registration_close_at) < new Date()) {
    return { ok: false, error: "Regjistrimi për këtë garë është mbyllur." };
  }

  // Server-side category guard against the chosen DOB + gender.
  const cv = validateCategoryChoice({
    category, dobIso: dob, raceIso: event.start_at, gender,
  });
  if (!cv.ok) return cv;

  const row: Record<string, unknown> = {
    event_id: event.id,
    full_name,
    email,
    phone: phone || null,
    dob,
    gender,
    category: category || null,
    club: club || null,
    notes: notes || null,
  };
  const { error } = await supabase.from("event_signups").insert(row as never);
  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "Je regjistruar tashmë me këtë email për këtë garë." };
    }
    console.error("event signup insert failed", error);
    return { ok: false, error: dbError(error, "Regjistrimi dështoi. Provo sërish.") };
  }
  revalidatePath(`/events/${slug}`);
  return { ok: true };
}
