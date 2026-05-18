"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

const STATUSES = ["pending", "confirmed", "waitlisted", "cancelled"] as const;

export type SignupPatch = {
  status?: string;
  bib_number?: string;        // empty string clears
  result_place?: string;      // empty string clears
  result_time?: string | null;
  result_notes?: string | null;
};

export async function updateSignup(
  eventId: string,
  signupId: string,
  patch: SignupPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const update: Record<string, unknown> = {};

    if (patch.status !== undefined) {
      if (!(STATUSES as readonly string[]).includes(patch.status)) {
        return { ok: false, error: "Statusi i pavlefshëm." };
      }
      update.status = patch.status;
    }
    if (patch.bib_number !== undefined) {
      const raw = patch.bib_number.trim();
      update.bib_number = raw === "" ? null : Number(raw);
      if (raw !== "" && Number.isNaN(update.bib_number)) {
        return { ok: false, error: "Numri i biçikletës duhet të jetë numër." };
      }
    }
    if (patch.result_place !== undefined) {
      const raw = patch.result_place.trim();
      update.result_place = raw === "" ? null : Number(raw);
      if (raw !== "" && Number.isNaN(update.result_place)) {
        return { ok: false, error: "Vendi duhet të jetë numër." };
      }
    }
    if (patch.result_time !== undefined) {
      const v = (patch.result_time ?? "").trim();
      update.result_time = v === "" ? null : v;
    }
    if (patch.result_notes !== undefined) {
      const v = (patch.result_notes ?? "").trim();
      update.result_notes = v === "" ? null : v;
    }

    const { error } = await supabase
      .from("event_signups")
      .update(update as never)
      .eq("id", signupId)
      .eq("event_id", eventId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/events/${eventId}/signups`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleResultsPublished(
  eventId: string,
  published: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const patch: Record<string, unknown> = {
      results_published: published,
      results_published_at: published ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("events")
      .update(patch as never)
      .eq("id", eventId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/events/${eventId}/results`);
    revalidatePath(`/admin/events/${eventId}/signups`);
    revalidatePath(`/events`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSignup(
  eventId: string,
  signupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const p = await getProfile();
    if (!p || p.role !== "admin") return { ok: false, error: "Forbidden — vetëm admin." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("event_signups")
      .delete()
      .eq("id", signupId)
      .eq("event_id", eventId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/events/${eventId}/signups`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
