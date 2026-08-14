import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createClient() {
  // The `as unknown as SupabaseClient<Database>` is TYPES ONLY — see the long
  // note in ./server.ts: @supabase/ssr@0.5's generic signature predates the
  // extra generic supabase-js 2.105 added, so without it every table resolves
  // to `never` and no query is checked.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient<Database>;
}
