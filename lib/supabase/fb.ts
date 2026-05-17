// Server-side Facebook data fetch helpers.
//
// The fb_* tables are populated by the sync-facebook Edge Function on an
// hourly pg_cron. These helpers wrap the typed queries used by app/page.tsx
// and app/news/page.tsx so the page bodies stay focused on layout.
//
// Public read RLS already filters hidden / unpublished posts, so callers
// don't need to add those clauses.

import { createClient } from "./server";

export const DEFAULT_PAGE_ID = "119279937733925";

export type FbCover = { storage_path: string } | null;

export type FbPageProfile = {
  id: string;
  name: string | null;
  about: string | null;
  bio: string | null;
  category: string | null;
  fan_count: number | null;
  website: string | null;
  picture: FbCover;
  cover: FbCover;
};

export type FbPostCard = {
  id: string;
  message: string | null;
  story: string | null;
  created_time: string;
  permalink_url: string | null;
  cover: FbCover;
};

export type FbPhotoCard = {
  id: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_time: string | null;
  media: { storage_path: string } | null;
};

// Public URL for a path in the `media` Storage bucket.
export function mediaUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/media/${storagePath}`;
}

export async function getFbPage(pageId = DEFAULT_PAGE_ID): Promise<FbPageProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fb_pages")
    .select(
      "id, name, about, bio, category, fan_count, website, " +
        "picture:media!picture_media_id(storage_path), " +
        "cover:media!cover_media_id(storage_path)",
    )
    .eq("id", pageId)
    .maybeSingle();
  return (data as unknown as FbPageProfile | null) ?? null;
}

export async function getRecentFbPosts(limit = 6): Promise<FbPostCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fb_posts")
    .select(
      "id, message, story, created_time, permalink_url, " +
        "cover:media!cover_media_id(storage_path)",
    )
    .order("created_time", { ascending: false })
    .limit(limit);
  return (data as unknown as FbPostCard[] | null) ?? [];
}

export async function getFbPostsPage({
  offset = 0,
  limit = 12,
}: { offset?: number; limit?: number } = {}): Promise<{
  rows: FbPostCard[];
  total: number;
}> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("fb_posts")
    .select(
      "id, message, story, created_time, permalink_url, " +
        "cover:media!cover_media_id(storage_path)",
      { count: "exact" },
    )
    .order("created_time", { ascending: false })
    .range(offset, offset + limit - 1);
  return {
    rows: (data as unknown as FbPostCard[] | null) ?? [],
    total: count ?? 0,
  };
}

export async function getFbPhotos(limit = 12): Promise<FbPhotoCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fb_photos")
    .select(
      "id, alt_text, width, height, created_time, " +
        "media:media!media_id(storage_path)",
    )
    .order("created_time", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as unknown as FbPhotoCard[] | null) ?? [];
}

// Compose a card title from FB post text. FB posts often only have
// `story` ("X added 5 photos") rather than `message`. We fall back so
// every card has at least something legible.
export function postTitle(p: FbPostCard, max = 80): string {
  const src = p.message || p.story || "";
  const oneLine = src.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

export function postBody(p: FbPostCard, max = 200): string {
  const src = p.message || "";
  if (!src) return "";
  const oneLine = src.replace(/\s+/g, " ").trim();
  // Skip what's already in the title.
  const after = oneLine.length > 80 ? oneLine.slice(80) : "";
  return after.length > max ? after.slice(0, max - 1) + "…" : after;
}

export function formatPostDate(iso: string, locale: "sq" | "en" = "sq"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
