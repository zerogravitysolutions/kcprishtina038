"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { dbError } from "@/lib/errors";

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
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  const { error } = await supabase.from("profiles").update({
    full_name: data.full_name,
    phone: data.phone,
    dob: data.dob,
    bio: data.bio,
    metadata: data.metadata,
  }).eq("id", user.id);
  if (error) return { ok: false, error: dbError(error, "Ruajtja e profilit dështoi. Provo sërish.") };
  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  return { ok: true };
}
