import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS and can use the Auth Admin API
 * (create / delete / update auth users).
 *
 * SERVER-ONLY — never import this from a client component. The service-role key
 * grants full DB access; it must never reach the browser. Only "use server"
 * actions call this. Requires the `SUPABASE_SERVICE_ROLE_KEY` env var (set it in
 * Vercel + local .env). Throws "SERVICE_ROLE_MISSING" when it isn't configured so
 * callers can surface a friendly message.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SERVICE_ROLE_MISSING");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
