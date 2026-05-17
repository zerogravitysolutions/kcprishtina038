import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database, UserRole, MemberStatus } from "./types";

type CookieSet = { name: string; value: string; options?: CookieOptions };

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL + " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Project Settings → " +
      "Environment Variables (Production + Preview + Development)."
    );
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — Set ignored, refresh via middleware.
          }
        },
      },
    }
  );
}

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  section_id: string | null;
};

// Fetch the current user's profile (or null).
export async function getProfile(): Promise<ProfileSummary | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, section_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data as ProfileSummary | null) ?? null;
}
