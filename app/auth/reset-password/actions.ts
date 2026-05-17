"use server";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) return { ok: false, error: "Fjalëkalimi duhet të jetë të paktën 8 karaktere." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
