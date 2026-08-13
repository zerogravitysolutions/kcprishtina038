// Role gates shared by the admin Server Actions.
//
// Extracted so /admin/people (which merges account management and roster
// editing onto ONE screen) reuses the SAME check the old separate pages used,
// instead of a second, drifting copy. The gate is the server action — hiding a
// button is not security.
//
// Both re-read role AND status on every call: a demoted or deactivated user
// must lose access immediately (Server Actions are standalone POST endpoints,
// so the admin layout's status check never runs for them).

import { createClient } from "@/lib/supabase/server";

export type Gate = { ok: true; id: string; role: string } | { ok: false; error: string };

async function gate(allowed: string[], refusal: string): Promise<Gate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const p = data as { role: string; status: string } | null;
  if (!p || p.status !== "active") return { ok: false, error: "Llogaria jote nuk është aktive." };
  if (!allowed.includes(p.role)) return { ok: false, error: refusal };
  return { ok: true, id: user.id, role: p.role };
}

/** Account operations (create/delete login, role, email, password, reset). */
export function requireAdmin(): Promise<Gate> {
  return gate(["admin"], "Vetëm admini mund ta bëjë këtë veprim.");
}

/** Roster operations — the same bar as team_members_write_admin in SQL. */
export function requireEditor(): Promise<Gate> {
  return gate(["admin", "editor"], "Vetëm admini ose redaktori mund ta bëjë këtë veprim.");
}
