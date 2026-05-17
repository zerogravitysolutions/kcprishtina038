// Graph API helpers + image downloader for the sync-facebook Edge Function.
// Deno runtime (Supabase Edge).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45";

const GRAPH = "https://graph.facebook.com/v22.0";

export type GraphPayload = Record<string, unknown> & {
  data?: unknown[];
  paging?: { next?: string; cursors?: { before?: string; after?: string } };
  error?: { message: string; type: string; code: number };
};

export async function graphGET(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<GraphPayload> {
  const u = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    lastErr = `${r.status} ${await r.text()}`;
    if (r.status >= 500 && attempt === 0) {
      await new Promise((res) => setTimeout(res, 500));
      continue;
    }
    break;
  }
  throw new Error(`graph ${path}: ${lastErr}`);
}

export async function graphGETURL(url: string): Promise<GraphPayload> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`graph next ${url}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Walk pages until keepGoing(items) returns false or there are no more pages.
// First page is fetched via path+params+token; subsequent pages follow paging.next.
export async function* graphPaginate(
  path: string,
  params: Record<string, string>,
  token: string,
  maxPages = 5,
): AsyncGenerator<unknown[]> {
  let payload = await graphGET(path, params, token);
  let page = 0;
  while (true) {
    const items = (payload.data ?? []) as unknown[];
    yield items;
    page++;
    const next = payload.paging?.next;
    if (!next || page >= maxPages) return;
    payload = await graphGETURL(next);
  }
}

// Pick a sensible extension from a Content-Type or URL pathname; default .jpg.
function inferExt(contentType: string | null, url: string): string {
  if (contentType) {
    const m = contentType.split(";")[0].trim().toLowerCase();
    if (m === "image/jpeg") return "jpg";
    if (m === "image/png") return "png";
    if (m === "image/webp") return "webp";
    if (m === "image/gif") return "gif";
    if (m.startsWith("image/")) return m.slice(6);
  }
  try {
    const p = new URL(url).pathname.toLowerCase();
    const dot = p.lastIndexOf(".");
    if (dot > 0 && p.length - dot <= 5) return p.slice(dot + 1);
  } catch { /* ignore */ }
  return "jpg";
}

// Download an FB CDN URL → upload to `media` bucket at `fb/<fbId>.<ext>`
// → upsert a public.media row keyed on (source='facebook', external_id=fbId)
// → return media.id. Idempotent: if the row already exists, returns its id
// without re-downloading.
export async function downloadToMedia(
  supa: SupabaseClient,
  url: string,
  fbId: string,
): Promise<string | null> {
  if (!url || !fbId) return null;

  const { data: existing } = await supa
    .from("media")
    .select("id")
    .eq("source", "facebook")
    .eq("external_id", fbId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${fbId}: ${r.status}`);
  const blob = await r.blob();
  const contentType = r.headers.get("content-type") || "image/jpeg";
  const ext = inferExt(contentType, url);
  const path = `fb/${fbId}.${ext}`;

  const { error: upErr } = await supa.storage
    .from("media")
    .upload(path, blob, { contentType, upsert: true });
  if (upErr) throw new Error(`storage upload ${fbId}: ${upErr.message}`);

  const { data: row, error: insErr } = await supa
    .from("media")
    .insert({
      storage_path: path,
      filename: `${fbId}.${ext}`,
      mime_type: contentType,
      byte_size: blob.size,
      source: "facebook",
      external_id: fbId,
      external_url: url,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`media insert ${fbId}: ${insErr.message}`);
  return row.id as string;
}

// Walk a post's attachments tree and collect every image url + a stable id.
// FB attachments can nest one level deep via `subattachments` (e.g. album posts).
export function extractPostImages(
  post: Record<string, unknown>,
): Array<{ id: string; url: string }> {
  const out: Array<{ id: string; url: string }> = [];
  const seen = new Set<string>();

  const push = (id: string | undefined, url: string | undefined) => {
    if (!url) return;
    const key = id ?? url;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: key, url });
  };

  // Top-level full_picture fallback (no individual id).
  const fp = (post["full_picture"] as string | undefined) ?? undefined;
  if (fp) push(`${post.id}_cover`, fp);

  const atts = ((post["attachments"] as { data?: unknown[] } | undefined)?.data ?? []) as Array<
    Record<string, unknown>
  >;
  for (const a of atts) {
    const media = a["media"] as
      | { image?: { src?: string } }
      | undefined;
    const target = a["target"] as { id?: string } | undefined;
    push(target?.id, media?.image?.src);
    const subs = ((a["subattachments"] as { data?: unknown[] } | undefined)?.data ?? []) as Array<
      Record<string, unknown>
    >;
    for (const sa of subs) {
      const sm = sa["media"] as { image?: { src?: string } } | undefined;
      const st = sa["target"] as { id?: string } | undefined;
      push(st?.id, sm?.image?.src);
    }
  }

  return out;
}

// Pick the variant in `images[]` closest to (but not below) 1080w.
// FB returns variants sorted desc by width; if all are smaller, take the
// largest. Returns the single chosen variant or null.
export function pickPhotoVariant(
  images: Array<{ source: string; width: number; height: number }> | undefined,
): { source: string; width: number; height: number } | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => b.width - a.width);
  // First variant <=1080 wide if any exists; else the largest.
  const target = sorted.find((v) => v.width <= 1080) ?? sorted[0];
  return target ?? null;
}
