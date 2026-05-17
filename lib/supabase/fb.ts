// Server-side data helpers for the public site.
//
// As of migration 0013, public.news is the single source of truth for
// what shows up on /news and the homepage news strip. The fb_* tables
// are populated by the sync-facebook Edge Function and feed into news
// via the Edge Function's upsertNewsFromPost step. Direct fb_posts
// reads are kept here (legacy section, marked) until callers migrate.

import { createClient } from "./server";

export const DEFAULT_PAGE_ID = "119279937733925";

// ============================================================
// Shared shapes
// ============================================================

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

export type FbPhotoCard = {
  id: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_time: string | null;
  media: { storage_path: string } | null;
};

// Card view-model used by /news list + landing strip.
export type NewsCard = {
  slug: string;
  title_sq: string;
  body_sq: string;
  published_at: string | null;
  tags: string[];
  source: "manual" | "facebook";
  external_url: string | null;
  cover: { storage_path: string } | null;
};

// Full detail row used by /news/[slug] page.
export type NewsDetail = NewsCard & {
  id: string;
  fb_post_id: string | null;
  gallery_media_ids: string[];
};

// Public URL for a path in the `media` Storage bucket.
export function mediaUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/media/${storagePath}`;
}

// ============================================================
// Page profile + photo strip (still read directly from fb_* tables)
// ============================================================

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

// ============================================================
// News — single source of truth for /news + landing strip.
// FB-sourced rows arrive via sync; manual rows arrive via /admin/news.
// Public read RLS filters non-published rows.
// ============================================================

const NEWS_CARD_SELECT =
  "slug, title_sq, body_sq, published_at, tags, source, external_url, " +
  "cover:media!cover_media_id(storage_path)";

export async function getRecentNews(limit = 6): Promise<NewsCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select(NEWS_CARD_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as unknown as NewsCard[] | null) ?? [];
}

export async function getNewsPage({
  offset = 0,
  limit = 12,
}: { offset?: number; limit?: number } = {}): Promise<{
  rows: NewsCard[];
  total: number;
}> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("news")
    .select(NEWS_CARD_SELECT, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  return {
    rows: (data as unknown as NewsCard[] | null) ?? [],
    total: count ?? 0,
  };
}

export async function getNewsBySlug(slug: string): Promise<NewsDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select(
      "id, slug, title_sq, body_sq, published_at, tags, source, " +
        "fb_post_id, external_url, gallery_media_ids, " +
        "cover:media!cover_media_id(storage_path)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as unknown as NewsDetail | null) ?? null;
}

// Look up storage paths for a list of media ids (used to render a
// news article's photo gallery). Order matches the input array.
export async function getMediaPaths(
  ids: string[],
): Promise<Array<{ id: string; storage_path: string }>> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select("id, storage_path")
    .in("id", ids);
  const rows = (data as unknown as Array<{ id: string; storage_path: string }> | null) ?? [];
  if (rows.length === 0) return [];
  const byId = new Map(rows.map((m) => [m.id, m.storage_path] as const));
  return ids
    .map((id) => {
      const path = byId.get(id);
      return path ? { id, storage_path: path } : null;
    })
    .filter((x): x is { id: string; storage_path: string } => x !== null);
}

// ============================================================
// Card text helpers (used by both list cards and detail page).
// ============================================================

export function newsCardTitle(n: { title_sq: string }, max = 80): string {
  const s = (n.title_sq || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function newsCardExcerpt(n: { body_sq: string; title_sq: string }, max = 200): string {
  const title = (n.title_sq || "").trim();
  const body = (n.body_sq || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  // Skip what's already in the title. Title for FB posts is the first
  // ~120 chars of the body, so we slice past that.
  const after = body.startsWith(title) ? body.slice(title.length).trim() : body;
  if (!after) return "";
  return after.length > max ? after.slice(0, max - 1) + "…" : after;
}

export function formatNewsDate(iso: string | null, locale: "sq" | "en" = "sq"): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ============================================================
// Legacy direct-from-fb_posts helpers — kept exported for any callers
// that still want raw FB post data. Prefer the news.* helpers above.
// ============================================================

export type FbPostCard = {
  id: string;
  message: string | null;
  story: string | null;
  created_time: string;
  permalink_url: string | null;
  cover: FbCover;
};

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

export function postTitle(p: FbPostCard, max = 80): string {
  const src = p.message || p.story || "";
  const oneLine = src.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

export function postBody(p: FbPostCard, max = 200): string {
  const src = p.message || "";
  if (!src) return "";
  const oneLine = src.replace(/\s+/g, " ").trim();
  const after = oneLine.length > 80 ? oneLine.slice(80) : "";
  return after.length > max ? after.slice(0, max - 1) + "…" : after;
}

export function formatPostDate(iso: string, locale: "sq" | "en" = "sq"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
