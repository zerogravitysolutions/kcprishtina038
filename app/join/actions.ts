"use server";
import { createClient } from "@/lib/supabase/server";

export type JoinResult = { ok: true } | { ok: false; error: string };

const SECTION_SLUGS = ["road","mtb","gravel","track","youth","women","unsure"] as const;
const EXP = ["beginner","intermediate","advanced"] as const;

export async function submitApplication(data: {
  name: string; email: string; phone: string; age: number | null;
  section: string; experience: string; notes: string; gotcha: string;
}): Promise<JoinResult> {
  if (data.gotcha) return { ok: true }; // bot — silently succeed

  // Lightweight validation.
  if (!data.name?.trim()) return { ok: false, error: "Emri është i detyrueshëm." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };
  if (data.age !== null && (data.age < 9 || data.age > 80)) return { ok: false, error: "Mosha duhet të jetë midis 9 dhe 80." };

  const supabase = await createClient();
  let sectionId: string | null = null;
  if (data.section && data.section !== "unsure" && SECTION_SLUGS.includes(data.section as typeof SECTION_SLUGS[number])) {
    const { data: sec } = await supabase.from("sections").select("id").eq("slug", data.section).maybeSingle();
    sectionId = (sec as { id: string } | null)?.id ?? null;
  }

  const insertFn = supabase.from("applications").insert as unknown as (
    row: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await insertFn({
    full_name: data.name.trim(),
    email: data.email.trim(),
    phone: data.phone.trim() || null,
    age: data.age,
    section_id: sectionId,
    experience: EXP.includes(data.experience as typeof EXP[number]) ? data.experience : null,
    notes: data.notes.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
