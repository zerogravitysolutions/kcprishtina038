"use server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

export async function changePassword(current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (next.length < 8) return { ok: false, error: "Fjalëkalimi i ri duhet të ketë së paku 8 karaktere." };
  if (next === current) return { ok: false, error: "Fjalëkalimi i ri duhet të jetë ndryshe nga i vjetri." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Identifikohu sërish dhe provo përsëri." };

  // Confirm the current password on a throwaway client so the browser's
  // session cookies stay untouched.
  const check = createStatelessClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: checkError } = await check.auth.signInWithPassword({ email: user.email, password: current });
  if (checkError) return { ok: false, error: "Fjalëkalimi aktual nuk është i saktë." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: dbError(error, "Ndryshimi i fjalëkalimit dështoi. Provo sërish.") };
  return { ok: true };
}
