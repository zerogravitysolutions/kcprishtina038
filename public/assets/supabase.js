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

// ============================================================
// Facebook sync helpers — read fb_* tables populated by the
// sync-facebook Edge Function on the hourly pg_cron schedule.
// All return [] / null on error to keep callers' fallback paths simple.
// ============================================================

// Public URL into the `media` Storage bucket for a stored path like
// "fb/<fb_id>.jpg". Returns null for empty inputs so callers can chain
// `mediaUrl(row?.media?.storage_path) || fallback`.
export function mediaUrl(storagePath) {
  if (!storagePath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;
}

// The page profile + downloaded cover + downloaded picture (single round-trip).
export async function getFbPage(pageId = "119279937733925") {
  const { data, error } = await supa
    .from("fb_pages")
    .select("id, name, about, bio, category, fan_count, website, picture:media!picture_media_id(storage_path), cover:media!cover_media_id(storage_path)")
    .eq("id", pageId)
    .maybeSingle();
  if (error) { console.warn("fb_pages fetch", error); return null; }
  return data;
}

// Latest N posts with their cover image. Hidden / unpublished posts are
// already filtered out by the public-read RLS policy on fb_posts.
export async function getRecentFbPosts(limit = 6) {
  const { data, error } = await supa
    .from("fb_posts")
    .select("id, message, story, created_time, permalink_url, cover:media!cover_media_id(storage_path)")
    .order("created_time", { ascending: false })
    .limit(limit);
  if (error) { console.warn("fb_posts fetch", error); return []; }
  return data || [];
}

// Paginated feed for the dedicated /news page.
export async function getFbPosts({ offset = 0, limit = 12 } = {}) {
  const { data, error, count } = await supa
    .from("fb_posts")
    .select("id, message, story, created_time, permalink_url, cover:media!cover_media_id(storage_path)", { count: "exact" })
    .order("created_time", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) { console.warn("fb_posts fetch", error); return { rows: [], total: 0 }; }
  return { rows: data || [], total: count ?? 0 };
}

// Latest N standalone photos (preferring album-attached, falling back to
// post-attached). Useful for hero collages and section photo strips.
export async function getFbPhotos(limit = 12) {
  const { data, error } = await supa
    .from("fb_photos")
    .select("id, alt_text, width, height, created_time, media:media!media_id(storage_path)")
    .order("created_time", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) { console.warn("fb_photos fetch", error); return []; }
  return data || [];
}
