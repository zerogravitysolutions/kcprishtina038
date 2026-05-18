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
  gallery_media_ids: string[];
};

// Full detail row used by /news/[slug] page.
export type NewsDetail = NewsCard & {
  id: string;
  fb_post_id: string | null;
};

// Public URL for a path in the `media` Storage bucket.
export function mediaUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/media/${storagePath}`;
}

// Build a clean FB permalink from a compound post id ("{page_id}_{post_id}").
// We avoid news.external_url because some permalinks FB returns use a
// non-canonical owner id that triggers a JS redirect stub — that stub
// breaks on mobile browsers (the user lands on a blank/login screen).
// Constructing the URL from page_id + post_id renders the post directly.
export function fbPermalink(
  fbPostId: string | null | undefined,
  fallback: string | null | undefined = null,
): string | null {
  if (!fbPostId) return fallback ?? null;
  const parts = fbPostId.split("_");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return fallback ?? null;
  return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
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

// Curated photos for the landing hero collage — editor-managed via
// the media.featured_in_hero flag. Falls back to recent FB photos
// when fewer than `limit` photos are featured, so the hero is never
// empty during the early days of curation.
export async function getHeroPhotos(limit = 3): Promise<FbPhotoCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select("id, storage_path, alt, width, height")
    .eq("featured_in_hero", true)
    .order("featured_order")
    .limit(limit);
  const featured = (data as unknown as Array<{
    id: string;
    storage_path: string;
    alt: string | null;
    width: number | null;
    height: number | null;
  }> | null) ?? [];
  const out: FbPhotoCard[] = featured.map((m) => ({
    id: m.id,
    alt_text: m.alt,
    width: m.width,
    height: m.height,
    created_time: null,
    media: { storage_path: m.storage_path },
  }));
  if (out.length >= limit) return out.slice(0, limit);

  // Top up with recent FB photos so the hero is never sparse.
  const fillNeeded = limit - out.length;
  const used = new Set(out.map((p) => p.media?.storage_path));
  const recent = await getFbPhotos(limit + 3); // a few extra in case of overlap
  for (const p of recent) {
    if (out.length >= limit) break;
    const path = p.media?.storage_path;
    if (path && !used.has(path)) {
      out.push(p);
      used.add(path);
    }
  }
  return out.slice(0, limit);
}

// ============================================================
// News — single source of truth for /news + landing strip.
// FB-sourced rows arrive via sync; manual rows arrive via /admin/news.
// Public read RLS filters non-published rows.
// ============================================================

const NEWS_CARD_SELECT =
  "slug, title_sq, body_sq, published_at, tags, source, external_url, " +
  "gallery_media_ids, " +
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

// ============================================================
// Race events — curated catalog. Replaces the auto-tagged news.tags 'race'
// path. Each event groups one or more news posts.
// ============================================================

export type RaceType = "road" | "mtb" | "tt" | "stage" | "gravel" | "cyclocross";

export type RaceEvent = {
  id: string;
  slug: string;
  name: string;
  race_date: string;          // ISO date
  location: string | null;
  race_type: RaceType | null;
  organizer: string | null;
  description: string | null;
  result_summary: string | null;
  external_url: string | null;
  cover_media_id: string | null;
  cover: { storage_path: string } | null;
  gallery_media_ids: string[];
  /** Count of related news posts, returned only when needed. */
  post_count?: number;
};

const RACE_EVENT_SELECT =
  "id, slug, name, race_date, location, race_type, organizer, " +
  "description, result_summary, external_url, gallery_media_ids, cover_media_id, " +
  "cover:media!cover_media_id(storage_path)";

/** Resolve a list of media IDs to {id, storage_path, alt, w, h}, in order. */
export async function getMediaByIds(
  ids: string[],
): Promise<Array<{ id: string; storage_path: string; alt: string | null; width: number | null; height: number | null }>> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("media")
    .select("id, storage_path, alt, width, height")
    .in("id", ids);
  const rows = (data as Array<{ id: string; storage_path: string; alt: string | null; width: number | null; height: number | null }> | null) ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
}

export async function getRaceEvents(): Promise<RaceEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("race_events")
    .select(RACE_EVENT_SELECT)
    .order("race_date", { ascending: false });
  return (data as unknown as RaceEvent[] | null) ?? [];
}

export async function getRaceEventBySlug(slug: string): Promise<RaceEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("race_events")
    .select(RACE_EVENT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as RaceEvent | null) ?? null;
}

// All news posts linked to a given race event. Used on /races/[slug].
export async function getNewsForRaceEvent(raceEventId: string): Promise<NewsCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select(NEWS_CARD_SELECT)
    .eq("race_event_id", raceEventId)
    .eq("status", "published")
    .order("published_at", { ascending: true });
  return (data as unknown as NewsCard[] | null) ?? [];
}

// Albanian display label for a race_type code.
export function raceTypeLabel(t: RaceType | null | undefined): string {
  switch (t) {
    case "road":       return "Rrugore";
    case "mtb":        return "MTB · XCO";
    case "tt":         return "Kronometer";
    case "stage":      return "Etapore";
    case "gravel":     return "Gravel";
    case "cyclocross": return "Cyclocross";
    default:           return "—";
  }
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
  // Trim and collapse newlines so cards don't render multi-line headlines.
  const s = (n.title_sq || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  // Truncate at word boundary near `max` to avoid mid-word cuts.
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const at = lastSpace > max * 0.6 ? lastSpace : max - 1;
  return cut.slice(0, at).replace(/[\s.,;:!?\-—]+$/, "") + "…";
}

export function newsCardExcerpt(n: { body_sq: string; title_sq: string }, max = 200): string {
  const title = (n.title_sq || "").replace(/…+$/, "").replace(/\s+/g, " ").trim();
  const body = (n.body_sq || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  // If the body starts with the title's text (FB posts: title is derived
  // from body's first line), skip ahead so the excerpt shows NEW content.
  const titlePrefix = title.length >= 12 ? title.slice(0, Math.min(title.length, 60)) : "";
  let after = body;
  if (titlePrefix && body.startsWith(titlePrefix)) {
    after = body.slice(title.length).trim();
  }
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
