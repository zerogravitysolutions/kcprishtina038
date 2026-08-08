"use server";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

export type LoginResult = { ok: true; role: string } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: dbError(error, "Kyçja dështoi. Provo sërish.") };
  }
  // Check status + role.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signOut();
    return { ok: false, error: "Profili yt nuk u gjet." };
  }
  const { data } = await supabase.from("profiles")
    .select("role, status").eq("id", user.id).maybeSingle();
  const profile = data as { role: string; status: string } | null;
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "Profili yt nuk u gjet. Kontakto klubin." };
  }
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "Llogaria jote është ende në pritje të aprovimit." };
  }
  return { ok: true, role: profile.role };
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/reset-password`
      : `https://kcprishtina038.vercel.app/auth/callback?next=/auth/reset-password`,
  });
  if (error) return { ok: false, error: dbError(error, "Dërgimi i email-it dështoi. Provo sërish.") };
  return { ok: true };
}
