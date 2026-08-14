import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database, UserRole, MemberStatus } from "./types";

type CookieSet = { name: string; value: string; options?: CookieOptions };

// cache() memoizes per request-render, so the admin layout and the page it
// wraps share ONE Supabase client (and one auth/profile lookup) instead of each
// building their own. This roughly halves the auth round-trips per page load.
export const createClient = cache(async () => {
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
  // TYPES ONLY, no runtime effect. @supabase/ssr@0.5 declares createServerClient
  // as returning SupabaseClient<Database, SchemaName, Schema> — the 3-generic
  // shape of supabase-js 2.4x. The installed supabase-js (2.105) inserted a
  // `SchemaNameOrClientOptions` generic in slot 2, so ssr hands our Schema
  // OBJECT to the SchemaName SLOT; the mismatch is swallowed by skipLibCheck and
  // every table then resolves to `never`. That is what forced the `as never`
  // casts all over the repo. Re-assert the correct shape until @supabase/ssr is
  // upgraded to a release built against supabase-js 2.10x.
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
  ) as unknown as SupabaseClient<Database>;
});

/**
 * Cookie-less anon client for cached PUBLIC reads. It carries no per-user or
 * per-request state, so its results can be memoized with unstable_cache (Next
 * Data Cache) and shared across all visitors — this is what lets public content
 * fetchers skip Supabase on most navigations even though the app renders
 * dynamically (the root layout reads the locale cookie). Never use it for
 * anything auth-dependent.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
  return createSbClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  section_id: string | null;
};

// Fetch the current user's profile (or null). Memoized per request so the
// layout + page (and any component) that need it don't each re-run getUser().
export const getProfile = cache(async (): Promise<ProfileSummary | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, section_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data as ProfileSummary | null) ?? null;
});
