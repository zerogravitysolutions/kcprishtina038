"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ProfileUpdate = {
  full_name: string;
  phone: string | null;
  dob: string | null;
  bio: string | null;
  metadata: Record<string, string>;
};

export async function saveProfile(data: ProfileUpdate): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i identifikuar." };
  const updateFn = supabase.from("profiles").update as unknown as (
    row: Record<string, unknown>
  ) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
  const { error } = await updateFn({
    full_name: data.full_name,
    phone: data.phone,
    dob: data.dob,
    bio: data.bio,
    metadata: data.metadata,
  }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  return { ok: true };
}
