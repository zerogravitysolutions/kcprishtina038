"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import type { EventSignupStatus, TableUpdate } from "@/lib/supabase/types";

async function assertEditor() {
  const p = await getProfile();
  if (!p || !["admin", "editor"].includes(p.role)) throw new Error("forbidden");
  return p;
}

const STATUSES: readonly EventSignupStatus[] = ["pending", "confirmed", "waitlisted", "cancelled"];

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
    const update: TableUpdate<"event_signups"> = {};

    if (patch.status !== undefined) {
      // find() rather than includes() so the value narrows to the column type.
      const status = STATUSES.find((s) => s === patch.status);
      if (!status) {
        return { ok: false, error: "Statusi nuk është i vlefshëm." };
      }
      update.status = status;
    }
    if (patch.bib_number !== undefined) {
      const raw = patch.bib_number.trim();
      update.bib_number = raw === "" ? null : Number(raw);
      if (raw !== "" && Number.isNaN(update.bib_number)) {
        return { ok: false, error: "Numri i startit duhet të jetë numër." };
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
      .update(update)
      .eq("id", signupId)
      .eq("event_id", eventId);
    if (error) return { ok: false, error: dbError(error, "Ruajtja e regjistrimit dështoi. Provo sërish.") };
    revalidatePath(`/admin/events/${eventId}/signups`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function toggleResultsPublished(
  eventId: string,
  published: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertEditor();
    const supabase = await createClient();
    const patch: TableUpdate<"events"> = {
      results_published: published,
      results_published_at: published ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", eventId);
    if (error) return { ok: false, error: dbError(error, "Ndryshimi i publikimit dështoi. Provo sërish.") };
    revalidatePath(`/admin/events/${eventId}/results`);
    revalidatePath(`/admin/events/${eventId}/signups`);
    revalidatePath(`/events`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

export async function deleteSignup(
  eventId: string,
  signupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const p = await getProfile();
    if (!p || p.role !== "admin") return { ok: false, error: "Vetëm admini mund ta bëjë këtë veprim." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("event_signups")
      .delete()
      .eq("id", signupId)
      .eq("event_id", eventId);
    if (error) return { ok: false, error: dbError(error, "Fshirja e regjistrimit dështoi. Provo sërish.") };
    revalidatePath(`/admin/events/${eventId}/signups`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
