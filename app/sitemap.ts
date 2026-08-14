import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * Generated sitemap, replacing the hand-maintained public/sitemap.xml (which
 * listed /sections — a 404 — and /section-mtb — a 308 legacy redirect — while
 * omitting /races, /documents, /team and /news, and stamped one invented
 * lastmod of 2026-05-17 on everything).
 *
 * Regenerated hourly: the route revalidates on the schedule below and the DB
 * read behind it is memoized for the same hour. The cache entry also carries
 * the "news" / "races" / "team" / "events" / "documents" tags, so an admin
 * action can bust it the moment it starts calling revalidateTag — today none
 * do (they only revalidatePath), which is why the hourly window is the real
 * freshness guarantee, and it is plenty for a sitemap.
 */
export const revalidate = 3600;

// The advertised origin lives in lib/site.ts so the root layout can read it for
// metadataBase without pulling this route's Supabase and cache imports into
// every server render. app/robots.ts uses the same constant.

/** Collections that back both a listing page and a set of detail pages. */
type Collection = "news" | "races" | "team" | "events" | "documents";

/**
 * Every public STATIC route, enumerated from the `page.tsx` files under app/.
 * Excluded on purpose:
 *   app/admin/**, app/portal/**   — authenticated
 *   app/login, app/auth/**        — auth flow
 *   app/invoice/[id]              — per-member document, not for crawlers
 *   /sections                     — no page.tsx, 404s
 *   /section-mtb                  — 308 → /sections/mtb (next.config.mjs)
 * Every URL below was verified to answer 200 on the live deployment.
 *
 * `from` names the collection whose newest row dates the listing page. The
 * evergreen pages (/about, /join, /sections/mtb) have no row to date them, so
 * they ship without a lastmod — an omitted lastmod is honest, an invented one
 * is the noise this file exists to remove.
 */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  from?: Collection;
}> = [
  { path: "/",             changeFrequency: "daily",   priority: 1.0, from: "news" },
  { path: "/news",         changeFrequency: "daily",   priority: 0.9, from: "news" },
  { path: "/races",        changeFrequency: "weekly",  priority: 0.9, from: "races" },
  { path: "/events",       changeFrequency: "weekly",  priority: 0.9, from: "events" },
  { path: "/team",         changeFrequency: "weekly",  priority: 0.8, from: "team" },
  { path: "/about",        changeFrequency: "monthly", priority: 0.8 },
  { path: "/sections/mtb", changeFrequency: "monthly", priority: 0.7 },
  { path: "/join",         changeFrequency: "monthly", priority: 0.7 },
  { path: "/documents",    changeFrequency: "monthly", priority: 0.6, from: "documents" },
];

/**
 * Per-collection row cap. A sitemap may hold 50 000 URLs; four detail
 * collections at this cap stay well under it and, more to the point, keep a
 * runaway table from stalling the route. The club is three orders of magnitude
 * below it today (tens of news posts), so nothing is dropped in practice — if a
 * collection ever reaches the cap it is truncated newest-first and the sitemap
 * should be split with generateSitemaps().
 */
const MAX_ROWS_PER_COLLECTION = 5000;

type SlugRow = { slug: string | null; updated_at: string | null; fallback_at: string | null };

function toDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** updated_at wins; fall back to the publish/occurrence date; else undefined. */
function rowLastModified(row: SlugRow): Date | undefined {
  return toDate(row.updated_at) ?? toDate(row.fallback_at);
}

type DynamicEntry = { path: string; lastModified?: Date };
type SitemapData = {
  entries: DynamicEntry[];
  /** Newest updated_at per collection, as an ISO string, for the listing pages. */
  newest: Partial<Record<Collection, string>>;
};

function toEntries(prefix: string, rows: SlugRow[]): DynamicEntry[] {
  const seen = new Set<string>();
  const out: DynamicEntry[] = [];
  for (const row of rows) {
    const slug = row.slug?.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ path: `${prefix}/${encodeURIComponent(slug)}`, lastModified: rowLastModified(row) });
  }
  return out;
}

function newestUpdatedAt(rows: Array<{ updated_at: string | null }>): string | undefined {
  let best: number | undefined;
  let bestRaw: string | undefined;
  for (const r of rows) {
    const d = toDate(r.updated_at);
    if (d && (best === undefined || d.getTime() > best)) {
      best = d.getTime();
      bestRaw = d.toISOString();
    }
  }
  return bestRaw;
}

/**
 * Slugs for the dynamic public routes, read with the cookie-less public client
 * so the result is cacheable across visitors instead of becoming a
 * per-request authenticated query (same pattern as lib/supabase/fb.ts).
 *
 * Each query mirrors how the matching page resolves its slug, so we never list
 * a URL that notFound()s:
 *   /news/[slug]   → news, status = published             (lib/supabase/fb.ts)
 *   /races/[slug]  → race_events, no status column        (lib/supabase/fb.ts)
 *   /team/[slug]   → team_members, active AND past both
 *                    render, and /team lists both         (lib/supabase/team.ts)
 *   /events/[slug] → events, status = published, slug set (app/events/[slug])
 * Row-level security already hides anything an anonymous visitor may not read.
 */
const getSitemapData = unstable_cache(
  async (): Promise<SitemapData> => {
    const supabase = createPublicClient();
    const limit = MAX_ROWS_PER_COLLECTION;

    const [news, races, team, events, documents] = await Promise.all([
      supabase
        .from("news")
        .select("slug, updated_at, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit),
      supabase
        .from("race_events")
        .select("slug, updated_at, race_date")
        .order("race_date", { ascending: false })
        .limit(limit),
      supabase
        .from("team_members")
        .select("slug, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("events")
        .select("slug, updated_at, start_at")
        .eq("status", "published")
        .not("slug", "is", null)
        .order("start_at", { ascending: false })
        .limit(limit),
      // Listed only to date /documents — the files themselves live in Storage,
      // there is no /documents/[slug] page.
      supabase
        .from("documents")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

    const rows = (
      data: Array<Record<string, unknown>> | null,
      fallbackKey?: string,
    ): SlugRow[] =>
      (data ?? []).map((r) => ({
        slug: (r.slug as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
        fallback_at: fallbackKey ? ((r[fallbackKey] as string | null) ?? null) : null,
      }));

    const newsRows = rows(news.data, "published_at");
    const raceRows = rows(races.data, "race_date");
    const teamRows = rows(team.data);
    const eventRows = rows(events.data, "start_at");

    return {
      entries: [
        ...toEntries("/news", newsRows),
        ...toEntries("/races", raceRows),
        ...toEntries("/team", teamRows),
        ...toEntries("/events", eventRows),
      ],
      newest: {
        news: newestUpdatedAt(newsRows),
        races: newestUpdatedAt(raceRows),
        team: newestUpdatedAt(teamRows),
        events: newestUpdatedAt(eventRows),
        documents: newestUpdatedAt((documents.data as Array<{ updated_at: string | null }> | null) ?? []),
      },
    };
  },
  ["public-sitemap-urls"],
  { revalidate: 3600, tags: ["news", "races", "team", "events", "documents"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A Supabase outage must not 500 the sitemap — degrade to the static routes.
  let data: SitemapData = { entries: [], newest: {} };
  try {
    data = await getSitemapData();
  } catch {
    /* keep the empty fallback */
  }

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    // Root keeps its trailing slash so the entry matches the canonical the
    // homepage emits (metadataBase resolves "/" to origin + "/").
    url: `${SITE_ORIGIN}${r.path}`,
    lastModified: r.from ? toDate(data.newest[r.from]) : undefined,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const dynamicEntries: MetadataRoute.Sitemap = data.entries.map((e) => ({
    url: `${SITE_ORIGIN}${e.path}`,
    lastModified: e.lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...dynamicEntries];
}
