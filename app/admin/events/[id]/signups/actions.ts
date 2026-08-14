"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { parseNumField } from "@/lib/numeric";
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
    // Both fields are type="text" + inputMode now (a numeric keypad on the
    // phone the commissaire uses at the finish line), so the browser filters
    // nothing: parseNumField is the whole check. Number() used to let "1e3" and
    // " 12 " through as a start number.
    if (patch.bib_number !== undefined) {
      update.bib_number = parseNumField(patch.bib_number, {
        label: "Numri i startit", kind: "int", min: 0, max: 99999,
      });
    }
    if (patch.result_place !== undefined) {
      update.result_place = parseNumField(patch.result_place, {
        label: "Vendi", kind: "int", min: 1, max: 99999,
      });
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
