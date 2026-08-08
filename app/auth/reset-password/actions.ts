"use server";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

export async function updatePassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) return { ok: false, error: "Fjalëkalimi duhet të ketë së paku 8 karaktere." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: dbError(error, "Ndryshimi i fjalëkalimit dështoi. Provo sërish.") };
  return { ok: true };
}
