# Facebook Page → Website Sync

## Context

The KÇ Prishtina 038 site (Supabase + static HTML on Vercel) currently relies on
placeholders (`.ph` divs) for most photography and has 3 news cards driven by a
`news` table that's empty in practice. The club already maintains an active
Facebook Page (id `100091212485910`) — the user is page admin. Goal: let the FB
Page be the canonical source of public content (posts, photos, events,
cover/about), with the website hydrating from it automatically on a schedule.
Approach: Graph API live sync via a Supabase Edge Function on `pg_cron`, with
images downloaded into the existing `media` Storage bucket so they survive
Facebook's CDN URL rotation.

## Approach

### 1. New migration — `supabase/migrations/20260517000012_facebook_sync.sql`

Enables `pg_cron` and `pg_net` extensions, adds five FB tables, extends `media`
and `events`, and registers an hourly cron job. Reuses `media` table + bucket
(no new bucket) so existing image plumbing keeps working.

**New tables**

- `public.fb_pages` — one row per synced FB page. Columns: `id text PK`
  (FB numeric id), `username`, `name`, `about`, `bio`, `category`, `website`,
  `fan_count int`, `picture_media_id uuid → media`, `cover_media_id uuid → media`,
  `last_synced_at`, `created_at`, `updated_at`.
- `public.fb_posts` — `id text PK` (FB compound id), `page_id text → fb_pages`,
  `message text`, `permalink_url`, `story`, `status_type`, `created_time
  timestamptz NOT NULL`, `cover_media_id uuid → media`, `attachments jsonb`,
  `is_published bool default true`, `hidden bool default false` (editor soft-hide),
  `raw jsonb` (full FB payload for debugging), `fetched_at`.
  Indices: `(page_id, created_time desc)`; partial on `created_time desc WHERE
  hidden = false`.
- `public.fb_albums` — `id text PK`, `page_id`, `name`, `description`,
  `cover_media_id`, `count`, `created_time`, `updated_time`, `fetched_at`.
- `public.fb_photos` — `id text PK`, `page_id`, `album_id text → fb_albums`,
  `post_id text → fb_posts`, `media_id uuid → media NOT NULL`, `alt_text`,
  `width`, `height`, `created_time`, `fetched_at`. Indices on `album_id` and
  `post_id`.
- `public.fb_sync_state` — one row per sync run for observability. `kind`
  (`post|photo|album|event|page`), `started_at`, `finished_at`, `ok bool`,
  `items_seen`, `items_upserted`, `items_failed`, `error text`, `cursor_next`.

**Enum**: `public.fb_source_kind as enum ('post','photo','album','event','page')`.

**Extend existing tables**

```sql
alter table public.media
  add column source text not null default 'upload'
    check (source in ('upload','facebook')),
  add column external_id  text,
  add column external_url text;
create unique index media_external_idx on public.media(source, external_id)
  where external_id is not null;

alter table public.events
  add column source text not null default 'native'
    check (source in ('native','facebook')),
  add column external_id  text unique,
  add column external_url text;
create index events_source_idx on public.events(source);
```

FB events upsert into `public.events` keyed on `external_id`, with
`source='facebook'`, `status='published'` (per user decision: auto-publish).
The existing `events.html` query and the `index.html` countdown pick them up
with **no frontend changes**. Re-sync only updates rows where
`source='facebook'` — editor edits to FB-origin events are preserved if the
editor first flips `source` to `'native'` (documented in admin runbook).

**RLS** — append to migration. Public read for visible content; service-role
writes bypass RLS. Editors can soft-hide posts.

```sql
alter table public.fb_pages   enable row level security;
alter table public.fb_posts   enable row level security;
alter table public.fb_albums  enable row level security;
alter table public.fb_photos  enable row level security;
alter table public.fb_sync_state enable row level security;

create policy fb_pages_select_all   on public.fb_pages   for select using (true);
create policy fb_albums_select_all  on public.fb_albums  for select using (true);
create policy fb_photos_select_all  on public.fb_photos  for select using (true);
create policy fb_posts_select_pub   on public.fb_posts   for select
  using (hidden = false and is_published = true);
create policy fb_posts_select_editor on public.fb_posts  for select to authenticated
  using (public.has_role(array['admin','editor']::public.user_role[]));
create policy fb_posts_hide_editor   on public.fb_posts  for update to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));
create policy fb_sync_admin on public.fb_sync_state for select to authenticated
  using (public.has_role(array['admin']::public.user_role[]));
```

Uses the existing `has_role()` helper (see
[supabase/migrations/20260517000006_rls_policies.sql](supabase/migrations/20260517000006_rls_policies.sql))
to stay consistent with current RLS conventions.

**pg_cron** — appended at the end of the migration. Stores function URL + shared
secret in `public.settings` (already exists; admin-only RLS). Cron runs at `:07`
hourly to dodge top-of-hour bursts.

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

insert into public.settings(key, value) values
  ('fb_sync_url',    '"https://xutklvcsdgzmhxzexisb.functions.supabase.co/sync-facebook"'::jsonb),
  ('fb_sync_secret', '""'::jsonb) on conflict do nothing;

select cron.schedule('fb-sync-hourly','7 * * * *', $$
  select net.http_post(
    url     := (select (value #>> '{}') from public.settings where key='fb_sync_url'),
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-sync-secret', (select (value #>> '{}') from public.settings where key='fb_sync_secret')),
    body    := jsonb_build_object('kind','all')
  );
$$);
```

### 2. Edge Function — `supabase/functions/sync-facebook/index.ts`

Deno-runtime function (Supabase auto-injects `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`). Auth: `x-sync-secret` header gate +
`--no-verify-jwt` deploy. Reads from `Deno.env`:

- `FB_PAGE_ACCESS_TOKEN` — never-expiring Page token (see §5)
- `FB_PAGE_ID` — default `100091212485910`
- `SYNC_SHARED_SECRET` — must match `x-sync-secret`

**Shared helpers** — `supabase/functions/_shared/fb.ts`:

- `graphFetch(path, params)` — appends token, paginates via `paging.next` until
  caller-supplied `keepGoing(items)` returns false. Retries 1× on 5xx with
  500ms backoff.
- `downloadToMedia(supa, url, fbId)` — fetches FB CDN URL as stream, uploads to
  `media` bucket at `fb/<fbId>.<ext>` (ext from content-type), then upserts a
  `public.media` row keyed on `(source='facebook', external_id=fbId)`. Returns
  the `media.id`. Skips download if a row already exists for that `external_id`.

**Sync algorithm** (entry point handles `kind='all'`):

1. Insert `fb_sync_state` rows per kind.
2. **Page profile** (≤1×/24h, gated by `fb_pages.last_synced_at`):
   `GET /v22.0/{page_id}?fields=id,name,username,about,bio,category,website,fan_count,picture{url},cover{source,id}`.
   Download picture + cover via `downloadToMedia`. Upsert `fb_pages`.
3. **Posts** (hourly, incremental): paginate
   `GET /v22.0/{page_id}/posts?fields=id,message,story,status_type,permalink_url,created_time,full_picture,attachments{type,media_type,media,subattachments,url,target}&limit=25`.
   Stop when an FB id already exists AND nothing newer remains (first run: stop
   at 5 pages = 125 posts OR `created_time < now-365d`). For each post: extract
   `full_picture` + each `attachments[].media.image.src` (and `subattachments`)
   → `downloadToMedia` → insert `fb_photos` rows with `post_id` set. Upsert
   `fb_posts` with `cover_media_id = first image`.
4. **Albums + Photos** (≤1×/24h):
   `/v22.0/{page_id}/albums?fields=id,name,description,count,cover_photo{id},created_time,updated_time`
   then `/v22.0/{page_id}/photos?type=uploaded&fields=id,name,alt_text,album,created_time,images{height,width,source}&limit=50`.
   Pick the variant in `images` closest to 1080w (cap blast radius). Download →
   `media` → `fb_photos` linked to `album_id`.
5. **Events** (hourly):
   `/v22.0/{page_id}/events?fields=id,name,description,start_time,end_time,place{name,location},cover{source}&time_filter=upcoming`.
   For each: download cover, then `INSERT INTO public.events` with `ON CONFLICT
   (external_id) DO UPDATE` (`WHERE events.source='facebook'`). Default
   `status='published'`, `type='race'` (per user decision; editor can re-type
   without losing the sync since updates are scoped to `source='facebook'`).
6. Per-item try/catch increments `items_failed`; one bad post never blocks the
   batch. Close `fb_sync_state` with counts + `ok`.

Idempotent: all upserts keyed on FB ids; reruns are no-ops. `media.external_id`
unique index dedupes images across posts/albums/photos.

### 3. Frontend integration

**Extend** `assets/supabase.js` with 4 helpers:

```js
export async function getRecentFbPosts(limit = 6) { ... }
export async function getFbPosts({ offset = 0, limit = 20 } = {}) { ... }   // paginated
export async function getFbPhotos(limit = 12) { ... }
export async function getPageInfo(pageId = '100091212485910') { ... }
export function mediaUrl(storagePath) { /* returns public URL into media bucket */ }
```

All use the existing `supa` client. They embed the FK to `media` so the
`storage_path` comes in one round trip.

**index.html**

- Hero collage (lines 289-394): new hydrator after disciplines block fills the
  3 `.ph` slots with `getFbPhotos(3)` (latest page photos).
- News section (lines 812-847): existing native-news hydrator (lines 1019-1041)
  falls back to `getRecentFbPosts(3 - nativeCount)` for empty slots. Card text
  = first 80 chars of `message` as title + next 200 chars as body; tag chip =
  "FACEBOOK"; card links to `permalink_url`. No `data-i18n` on FB cards (SQ
  text stays as-is when EN toggle is active — acceptable per spec).

**about.html** — hydrator pulls `getPageInfo()` and:

- Replaces the hardcoded club bio paragraph in the mission section with
  `page.about` if non-empty.
- Sets the hero band background to `mediaUrl(page.cover.storage_path)` when
  present.
- Founder portraits and timeline stay hardcoded (manual mapping out of scope).

**events.html** — **zero code changes**. FB events arrive as rows in
`public.events`; the existing select at lines 426-496 already returns them.
Optional small enhancement: add `source` to the select and render an "FB" chip
when `ev.source === 'facebook'`.

**section-mtb.html** — hero + roster `.ph` slots fall back to
`getFbPhotos(N)` when present (same pattern as index hero).

**NEW page: `news.html`** — full FB feed:

- Standard header/footer/navigation from existing pages.
- Paginated grid of post cards (12 per page) using `getFbPosts({ offset, limit })`.
- Each card: image (if any), date, message excerpt, "View on Facebook" link.
- Navigation: nav bar gets a "Lajme" / "News" link added to all pages
  (`data-i18n="nav.news"`). New I18N keys in `assets/app.js`: `nav.news`,
  `news.title`, `news.empty`, `news.viewOnFb`, `news.more`, `news.older`.

### 4. Meta Developer setup (user task — do once)

1. `developers.facebook.com` → Create App → use case **Other** → type
   **Business**. Save **App ID** + **App Secret**.
2. Add product **Facebook Login for Business**.
3. Graph API Explorer → select the app → "Get User Access Token" with scopes:
   `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`. All
   three are auto-granted to Page admins in **Development mode** — **no App
   Review required**.
4. Exchange short-lived → long-lived (60d) user token:
   `GET https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED}`.
5. Exchange long-lived user token → never-expiring Page token:
   `GET https://graph.facebook.com/v22.0/{USER_ID}/accounts?access_token={LONG_LIVED}`
   → find KÇ Prishtina 038 in `data[]` → take its `access_token`.
6. Verify never-expires:
   `GET /v22.0/debug_token?input_token={PAGE_TOKEN}&access_token={PAGE_TOKEN}`
   → `data.expires_at` must be `0`.
7. Set Supabase secrets (user runs locally):
   ```bash
   supabase secrets set \
     FB_PAGE_ACCESS_TOKEN='{page_token}' \
     FB_PAGE_ID='100091212485910' \
     SYNC_SHARED_SECRET="$(openssl rand -hex 32)"
   ```
8. Mirror `SYNC_SHARED_SECRET` into `public.settings.fb_sync_secret` via SQL
   (one `update public.settings set value = to_jsonb('<secret>'::text) where
   key='fb_sync_secret';`) so the cron job can pass it as a header.
9. `supabase functions deploy sync-facebook --no-verify-jwt`.

App stays in **Development mode** forever — only Page admins can read content
via this token, which is exactly the use case.

## Critical files

- [supabase/migrations/20260517000012_facebook_sync.sql](supabase/migrations/20260517000012_facebook_sync.sql) — new
- [supabase/functions/sync-facebook/index.ts](supabase/functions/sync-facebook/index.ts) — new
- [supabase/functions/_shared/fb.ts](supabase/functions/_shared/fb.ts) — new (Graph helpers + image downloader)
- [assets/supabase.js](assets/supabase.js) — extend with FB helpers (no breaking changes)
- [assets/app.js](assets/app.js) — add `nav.news` + `news.*` I18N keys
- [index.html](index.html) — hero hydrator + news fallback in the existing `<script type="module">` block
- [about.html](about.html) — page info hydrator
- [events.html](events.html) — optional `source` chip
- [section-mtb.html](section-mtb.html) — photo fallback
- [news.html](news.html) — new page (full FB feed)
- Navigation in all public pages — add "Lajme/News" link

## Risks / tradeoffs

- **FB URL expiry** — solved by downloading at sync time; we never serve
  `fbcdn.net` URLs.
- **Rate limits** — Page-level Graph API allows ~200 calls/hour/user; our
  hourly run does ~5 calls steady-state. Well under.
- **Token revocation** — if user changes FB password or removes the app, token
  dies; site keeps serving cached data, `fb_sync_state.error` logs 401. Mitigate
  later with an admin widget reading `fb_sync_state where ok=false`.
- **App Review not needed** — the three scopes are granted to Page admins in
  Dev mode; only relevant if we ever read non-admin pages.
- **Storage** — back-of-envelope: ~50MB posts + ~150MB photos + 1MB
  cover/profile = **~200MB**, well under Supabase Free 1GB cap. The 1080w
  variant pick caps growth.
- **Single-language posts** — FB content is single-language (SQ). EN toggle
  doesn't translate FB cards. Acceptable; schema is additive — a `message_en`
  column + LLM call can be added later without migration churn.
- **FB events auto-publish (user decision)** — a casual ride on FB will appear
  on events.html within an hour. Mitigation: editor can flip the row to
  `status='draft'` or `source='native'` in admin, and that change is sticky
  because re-sync only touches `source='facebook'` rows.
- **`bio` field on Pages** — Graph API exposes `about` (short) and
  `description` (long) reliably; `bio` only for some categories. Schema stores
  both; frontend prefers `about`.

## Verification

End-to-end smoke test after deploy:

1. **Migration applied** — in Supabase SQL editor:
   ```sql
   select count(*) from pg_tables where schemaname='public' and tablename
     like 'fb_%';            -- expect 5
   select * from cron.job where jobname='fb-sync-hourly'; -- expect 1 row
   ```
2. **Token + secrets set** —
   `supabase secrets list` shows FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID,
   SYNC_SHARED_SECRET.
3. **Manual trigger** —
   ```bash
   curl -X POST -H "x-sync-secret: $SECRET" -H "content-type: application/json" \
     -d '{"kind":"all"}' \
     https://xutklvcsdgzmhxzexisb.functions.supabase.co/sync-facebook
   ```
   Expect 200 with `{ok:true, counts:{posts:N, photos:M, events:K, page:1}}`.
4. **DB populated** —
   ```sql
   select count(*) from public.fb_posts;     -- > 0
   select count(*) from public.fb_photos;    -- > 0
   select count(*) from public.fb_pages;     -- = 1
   select count(*) from public.events where source='facebook'; -- ≥ 0
   select count(*) from public.media where source='facebook';  -- > 0
   select started_at, kind, ok, items_upserted, error
     from public.fb_sync_state order by started_at desc limit 5;
   ```
5. **Storage populated** — Supabase Storage UI → `media` bucket → `fb/` prefix
   has image files.
6. **Frontend smoke** —
   - `python3 -m http.server 8000` from project root.
   - `http://localhost:8000/index.html` — hero collage shows FB photos (not
     `.ph` placeholders); news section shows latest FB posts when native
     `news` is empty.
   - `http://localhost:8000/news.html` — full feed loads, pagination works.
   - `http://localhost:8000/about.html` — bio/cover hydrated from FB page.
   - `http://localhost:8000/events.html` — FB events appear inline with native
     events.
7. **Hourly cron** — wait ≥1h or run
   `select cron.run_job((select jobid from cron.job where jobname='fb-sync-hourly'));`
   then check `fb_sync_state.started_at` increased.
