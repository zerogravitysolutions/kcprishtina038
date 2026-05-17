// sync-facebook — pulls KÇ Prishtina 038's Facebook Page content into Supabase.
//
// Triggered hourly by pg_cron (see migration 0012) and on-demand via:
//   curl -X POST -H "x-sync-secret: $SECRET" \
//        -H "content-type: application/json" \
//        -d '{"kind":"all"}' \
//        https://<project>.functions.supabase.co/sync-facebook
//
// Required env (Supabase secrets):
//   FB_PAGE_ACCESS_TOKEN   never-expiring Page access token
//   FB_PAGE_ID             page id (default: 100091212485910)
//   SYNC_SHARED_SECRET     must match x-sync-secret header
// Auto-injected on the Edge runtime: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45";
import {
  downloadToMedia,
  extractPostImages,
  graphGET,
  graphPaginate,
  pickPhotoVariant,
} from "../_shared/fb.ts";

type Kind = "post" | "photo" | "album" | "event" | "page";

interface SyncCounts {
  seen: number;
  upserted: number;
  failed: number;
}

const DEFAULT_PAGE_ID = "100091212485910";

Deno.serve(async (req) => {
  const sharedSecret = Deno.env.get("SYNC_SHARED_SECRET") ?? "";
  if (!sharedSecret || req.headers.get("x-sync-secret") !== sharedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const token = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  if (!token) {
    return jsonError("FB_PAGE_ACCESS_TOKEN not set", 500);
  }

  let body: { kind?: string; page_id?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch { /* empty body is fine */ }

  const pageId = body.page_id ?? Deno.env.get("FB_PAGE_ID") ?? DEFAULT_PAGE_ID;
  const kind = (body.kind ?? "all").toLowerCase();

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const runs: Array<{ kind: Kind; counts: SyncCounts; error?: string }> = [];
  const want = (k: Kind) => kind === "all" || kind === k;

  if (want("page"))  runs.push({ kind: "page",  ...(await runSafe(supa, "page",  pageId, () => syncPage(supa, pageId, token))) });
  if (want("post"))  runs.push({ kind: "post",  ...(await runSafe(supa, "post",  pageId, () => syncPosts(supa, pageId, token))) });
  if (want("album")) runs.push({ kind: "album", ...(await runSafe(supa, "album", pageId, () => syncAlbums(supa, pageId, token))) });
  if (want("photo")) runs.push({ kind: "photo", ...(await runSafe(supa, "photo", pageId, () => syncPhotos(supa, pageId, token))) });
  if (want("event")) runs.push({ kind: "event", ...(await runSafe(supa, "event", pageId, () => syncEvents(supa, pageId, token))) });

  const ok = runs.every((r) => !r.error);
  return new Response(JSON.stringify({ ok, page_id: pageId, runs }), {
    status: ok ? 200 : 207,
    headers: { "content-type": "application/json" },
  });
});

function jsonError(msg: string, status = 500) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Wrap a sync function: open fb_sync_state row, run, close with counts/error.
// Per-item errors stay inside the sync fn (incrementing failed); only
// uncaught failures bubble up here and abort the row's kind.
async function runSafe(
  supa: SupabaseClient,
  kind: Kind,
  pageId: string,
  fn: () => Promise<SyncCounts>,
): Promise<{ counts: SyncCounts; error?: string }> {
  const { data: state } = await supa
    .from("fb_sync_state")
    .insert({ page_id: pageId, kind })
    .select("id")
    .single();
  const stateId = state?.id as string | undefined;

  try {
    const counts = await fn();
    if (stateId) {
      await supa
        .from("fb_sync_state")
        .update({
          finished_at: new Date().toISOString(),
          ok: counts.failed === 0,
          items_seen: counts.seen,
          items_upserted: counts.upserted,
          items_failed: counts.failed,
        })
        .eq("id", stateId);
    }
    return { counts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (stateId) {
      await supa
        .from("fb_sync_state")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: msg.slice(0, 1000),
        })
        .eq("id", stateId);
    }
    return { counts: { seen: 0, upserted: 0, failed: 1 }, error: msg };
  }
}

// ============================================================
// Page profile — short call, gated to once/24h.
// ============================================================
async function syncPage(
  supa: SupabaseClient,
  pageId: string,
  token: string,
): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: 0, upserted: 0, failed: 0 };

  const { data: existing } = await supa
    .from("fb_pages")
    .select("last_synced_at")
    .eq("id", pageId)
    .maybeSingle();
  const last = existing?.last_synced_at
    ? new Date(existing.last_synced_at as string).getTime()
    : 0;
  if (Date.now() - last < 23 * 3600 * 1000) {
    return counts; // throttled
  }

  const p = await graphGET(
    `/${pageId}`,
    {
      fields:
        "id,name,username,about,bio,category,website,fan_count,picture{url},cover{source,id}",
    },
    token,
  );
  counts.seen = 1;

  const picture = (p["picture"] as { data?: { url?: string } } | undefined)?.data?.url;
  const cover = p["cover"] as { source?: string; id?: string } | undefined;

  let pictureMediaId: string | null = null;
  let coverMediaId: string | null = null;
  try {
    if (picture) pictureMediaId = await downloadToMedia(supa, picture, `${pageId}_picture`);
  } catch { counts.failed++; }
  try {
    if (cover?.source && cover.id) coverMediaId = await downloadToMedia(supa, cover.source, cover.id);
  } catch { counts.failed++; }

  const { error } = await supa.from("fb_pages").upsert({
    id: pageId,
    name: (p["name"] as string | undefined) ?? null,
    username: (p["username"] as string | undefined) ?? null,
    about: (p["about"] as string | undefined) ?? null,
    bio: (p["bio"] as string | undefined) ?? null,
    category: (p["category"] as string | undefined) ?? null,
    website: (p["website"] as string | undefined) ?? null,
    fan_count: (p["fan_count"] as number | undefined) ?? null,
    picture_media_id: pictureMediaId,
    cover_media_id: coverMediaId,
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw error;
  counts.upserted = 1;
  return counts;
}

// ============================================================
// Posts — incremental: stop walking back once we hit a known id.
// First-run safety: at most 5 pages × 25 posts = 125 posts.
// ============================================================
async function syncPosts(
  supa: SupabaseClient,
  pageId: string,
  token: string,
): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: 0, upserted: 0, failed: 0 };

  for await (const page of graphPaginate(
    `/${pageId}/posts`,
    {
      fields:
        "id,message,story,status_type,permalink_url,created_time,full_picture,attachments{type,media_type,media,subattachments,url,target}",
      limit: "25",
    },
    token,
    5,
  )) {
    let stopAfterPage = false;

    for (const raw of page) {
      const post = raw as Record<string, unknown>;
      const id = post["id"] as string;
      if (!id) continue;
      counts.seen++;

      try {
        const { data: existing } = await supa
          .from("fb_posts")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (existing) {
          // Already imported — assume earlier pages are also imported. We
          // still re-upsert metadata in case message edits matter, but flag
          // pagination to stop after this page.
          stopAfterPage = true;
        }

        // Download all images attached to this post.
        const images = extractPostImages(post);
        const photoRows: Array<{ id: string; media_id: string }> = [];
        for (const img of images) {
          try {
            const mediaId = await downloadToMedia(supa, img.url, img.id);
            if (mediaId) photoRows.push({ id: img.id, media_id: mediaId });
          } catch (e) {
            counts.failed++;
            console.warn("image fail", img.id, e);
          }
        }

        const coverMediaId = photoRows[0]?.media_id ?? null;

        const { error: upErr } = await supa.from("fb_posts").upsert({
          id,
          page_id: pageId,
          message: (post["message"] as string | undefined) ?? null,
          permalink_url: (post["permalink_url"] as string | undefined) ?? null,
          story: (post["story"] as string | undefined) ?? null,
          status_type: (post["status_type"] as string | undefined) ?? null,
          created_time: post["created_time"] as string,
          cover_media_id: coverMediaId,
          attachments: (post["attachments"] as object | undefined) ?? [],
          raw: post,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "id", ignoreDuplicates: false });
        if (upErr) throw upErr;

        // Upsert fb_photos rows (one per image, linked to this post).
        for (const pr of photoRows) {
          const { error: phErr } = await supa.from("fb_photos").upsert({
            id: pr.id,
            page_id: pageId,
            post_id: id,
            media_id: pr.media_id,
            created_time: post["created_time"] as string,
            fetched_at: new Date().toISOString(),
          }, { onConflict: "id", ignoreDuplicates: false });
          if (phErr) counts.failed++;
        }

        counts.upserted++;
      } catch (e) {
        counts.failed++;
        console.warn("post fail", id, e);
      }
    }

    if (stopAfterPage) break;
  }

  return counts;
}

// ============================================================
// Albums — metadata only. Their photos are pulled by syncPhotos.
// ============================================================
async function syncAlbums(
  supa: SupabaseClient,
  pageId: string,
  token: string,
): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: 0, upserted: 0, failed: 0 };

  for await (const page of graphPaginate(
    `/${pageId}/albums`,
    {
      fields:
        "id,name,description,count,cover_photo{id},created_time,updated_time",
      limit: "25",
    },
    token,
    3,
  )) {
    for (const raw of page) {
      const a = raw as Record<string, unknown>;
      const id = a["id"] as string;
      if (!id) continue;
      counts.seen++;
      try {
        const cover = (a["cover_photo"] as { id?: string } | undefined)?.id ?? null;
        let coverMediaId: string | null = null;
        if (cover) {
          // We don't have the cover URL here — syncPhotos will fill the
          // image; we just keep the linkage by media id once available.
          const { data: m } = await supa
            .from("media")
            .select("id")
            .eq("source", "facebook")
            .eq("external_id", cover)
            .maybeSingle();
          coverMediaId = m?.id ?? null;
        }

        const { error } = await supa.from("fb_albums").upsert({
          id,
          page_id: pageId,
          name: (a["name"] as string | undefined) ?? null,
          description: (a["description"] as string | undefined) ?? null,
          cover_media_id: coverMediaId,
          count: (a["count"] as number | undefined) ?? null,
          created_time: (a["created_time"] as string | undefined) ?? null,
          updated_time: (a["updated_time"] as string | undefined) ?? null,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "id", ignoreDuplicates: false });
        if (error) throw error;
        counts.upserted++;
      } catch (e) {
        counts.failed++;
        console.warn("album fail", id, e);
      }
    }
  }

  return counts;
}

// ============================================================
// Photos — uploaded library. Gated to once/24h by checking the most recent
// fb_sync_state row for this kind.
// ============================================================
async function syncPhotos(
  supa: SupabaseClient,
  pageId: string,
  token: string,
): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: 0, upserted: 0, failed: 0 };

  const { data: lastOk } = await supa
    .from("fb_sync_state")
    .select("started_at")
    .eq("kind", "photo")
    .eq("ok", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    lastOk?.started_at &&
    Date.now() - new Date(lastOk.started_at as string).getTime() < 23 * 3600 * 1000
  ) {
    return counts;
  }

  for await (const page of graphPaginate(
    `/${pageId}/photos`,
    {
      type: "uploaded",
      fields:
        "id,name,alt_text,album,created_time,images{height,width,source}",
      limit: "50",
    },
    token,
    4,
  )) {
    for (const raw of page) {
      const ph = raw as Record<string, unknown>;
      const id = ph["id"] as string;
      if (!id) continue;
      counts.seen++;
      try {
        const variant = pickPhotoVariant(
          ph["images"] as
            | Array<{ source: string; width: number; height: number }>
            | undefined,
        );
        if (!variant) { counts.failed++; continue; }
        const mediaId = await downloadToMedia(supa, variant.source, id);
        if (!mediaId) { counts.failed++; continue; }
        const albumId = (ph["album"] as { id?: string } | undefined)?.id ?? null;

        const { error } = await supa.from("fb_photos").upsert({
          id,
          page_id: pageId,
          album_id: albumId,
          media_id: mediaId,
          alt_text: (ph["alt_text"] as string | undefined) ?? (ph["name"] as string | undefined) ?? null,
          width: variant.width,
          height: variant.height,
          created_time: (ph["created_time"] as string | undefined) ?? null,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "id", ignoreDuplicates: false });
        if (error) throw error;
        counts.upserted++;
      } catch (e) {
        counts.failed++;
        console.warn("photo fail", id, e);
      }
    }
  }

  return counts;
}

// ============================================================
// Events — upsert into public.events with source='facebook',
// status='published' (auto-publish per user decision). Updates only touch
// rows that are still source='facebook'; if an editor adopts a row by
// flipping source to 'native', it stops being overwritten.
// ============================================================
async function syncEvents(
  supa: SupabaseClient,
  pageId: string,
  token: string,
): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: 0, upserted: 0, failed: 0 };

  for await (const page of graphPaginate(
    `/${pageId}/events`,
    {
      fields:
        "id,name,description,start_time,end_time,place{name,location},cover{source}",
      time_filter: "upcoming",
      limit: "25",
    },
    token,
    3,
  )) {
    for (const raw of page) {
      const ev = raw as Record<string, unknown>;
      const fbId = ev["id"] as string;
      if (!fbId) continue;
      counts.seen++;

      try {
        const cover = (ev["cover"] as { source?: string } | undefined)?.source;
        let coverMediaId: string | null = null;
        if (cover) {
          try {
            coverMediaId = await downloadToMedia(supa, cover, `${fbId}_cover`);
          } catch { /* tolerate */ }
        }

        const place = ev["place"] as { name?: string } | undefined;
        const row = {
          source: "facebook",
          external_id: fbId,
          external_url: `https://www.facebook.com/events/${fbId}`,
          status: "published" as const,
          type: "race" as const,
          title_sq: (ev["name"] as string | undefined) ?? "Event",
          description_sq: (ev["description"] as string | undefined) ?? null,
          start_at: ev["start_time"] as string,
          end_at: (ev["end_time"] as string | undefined) ?? null,
          location: place?.name ?? null,
          cover_media_id: coverMediaId,
        };

        const { data: existing } = await supa
          .from("events")
          .select("id, source")
          .eq("external_id", fbId)
          .maybeSingle();

        if (!existing) {
          const { error } = await supa.from("events").insert(row);
          if (error) throw error;
          counts.upserted++;
        } else if (existing.source === "facebook") {
          const { error } = await supa.from("events").update(row).eq("id", existing.id);
          if (error) throw error;
          counts.upserted++;
        }
        // else: editor-adopted (source='native'), leave alone.
      } catch (e) {
        counts.failed++;
        console.warn("event fail", fbId, e);
      }
    }
  }

  return counts;
}
