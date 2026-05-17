// KÇ Prishtina 038 — Supabase client + session helpers.
//
// The publishable key is browser-safe by design (Supabase's `sb_publishable_*`
// keys replace the older anon JWT and are intended to ship in client code).
// All access control lives in Postgres RLS policies, not here.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45/+esm";

const SUPABASE_URL = "https://xutklvcsdgzmhxzexisb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cB3Hl2_07OqDyV-U5exvbQ_WiTjKx6M";

export const supa = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: "kc038_session",
  },
});

export async function getSession() {
  const { data } = await supa.auth.getSession();
  return data.session || null;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supa
    .from("profiles")
    .select("id, full_name, email, role, section_id, avatar_url, status")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) { console.error("profile fetch", error); return null; }
  return data;
}

// Page-guard for protected routes. Pass `roles` to restrict further.
// Redirects and returns null when the visitor is not allowed; the caller
// should `if (!profile) return;` immediately after.
export async function requireAuth({ roles = null, redirect = "login.html" } = {}) {
  const profile = await getProfile();
  if (!profile) { window.location.replace(redirect); return null; }
  if (profile.status !== "active") {
    alert("Llogaria juaj nuk është ende e aktivizuar.");
    window.location.replace("login.html");
    return null;
  }
  if (roles && !roles.includes(profile.role)) {
    window.location.replace(profile.role === "member" ? "member-portal.html" : "admin/dashboard.html");
    return null;
  }
  return profile;
}

export async function signOut() {
  await supa.auth.signOut();
  window.location.href = "login.html";
}

// Convenience: lookup a section by slug.
export async function getSectionBySlug(slug) {
  const { data } = await supa.from("sections").select("id, slug, name_sq, name_en").eq("slug", slug).maybeSingle();
  return data;
}
