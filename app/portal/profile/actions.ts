"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { dbError } from "@/lib/errors";
import { parseNumField } from "@/lib/numeric";

export type ProfileUpdate = {
  full_name: string;
  phone: string | null;
  dob: string | null;
  bio: string | null;
  metadata: Record<string, string>;
};

/**
 * The three body-measurement keys are typed on a numeric keypad (type="text" +
 * inputMode — type="number" eats the "," an Albanian phone sends), so the
 * browser filters nothing and the blob would happily store "shumë" as a weight.
 */
const NUMERIC_META: { key: string; label: string; max: number }[] = [
  { key: "shoe_eu",    label: "Numri i këpucëve", max: 70 },
  { key: "height_cm",  label: "Gjatësia",         max: 260 },
  { key: "weight_kg",  label: "Pesha",            max: 400 },
];

export async function saveProfile(data: ProfileUpdate): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  // The blob stores STRINGS, so validating and then writing the raw value back
  // would leave "68,5" in the database — and w/kg on the coach side reads it
  // with parseFloat, which returns 68. Store what parseNumField actually
  // parsed, so the comma can never survive the round trip whatever the client
  // sends (a Server Action is a public POST endpoint; the form's own
  // normalisation is not a guarantee).
  const metadata = { ...(data.metadata ?? {}) };
  for (const { key, label, max } of NUMERIC_META) {
    try {
      const n = parseNumField(metadata[key], { label, min: 0, max });
      if (n === null) delete metadata[key];
      else metadata[key] = String(n);
    } catch (e) {
      return { ok: false, error: dbError(e) };
    }
  }
  const { error } = await supabase.from("profiles").update({
    full_name: data.full_name,
    phone: data.phone,
    dob: data.dob,
    bio: data.bio,
    metadata,
  }).eq("id", user.id);
  if (error) return { ok: false, error: dbError(error, "Ruajtja e profilit dështoi. Provo sërish.") };
  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  return { ok: true };
}
