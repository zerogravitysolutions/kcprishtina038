# Plan: KÇ Prishtina 038 — Supabase Backend (Auth + RBAC + Data Layer)

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-05-17 |
| Author | Claude + Qëndrim |
| Status | READY FOR REVIEW |
| Estimated effort | ~28 hours implementer time, spread across 8 phases. Realistically 1–2 weeks calendar time including async Supabase setup, email-template tuning, and content seeding. |
| Files affected | ~45 new / modified (3 new top-level HTML, 12 admin HTML, 1 admin JS shell, 1 admin CSS, 8+ new `assets/*.js` modules, 14 SQL migration files, 1 seed file, ~6 RPC functions, 2 Vercel env vars, README updates) |
| New external services | Supabase (1 project, free tier) |
| Risk level | MEDIUM — first time crossing from "static site" to "stateful app with auth"; RLS misconfiguration is the main landmine. |

## Goal

Promote the static marketing site to a working club application with five distinct roles (admin / editor / staff / coach / member), a Supabase Postgres backend with row-level security, and the 15 new pages from the latest design bundle (login + member portal + member profile + 12 admin pages) wired to real data. Public marketing pages stay unchanged in their public reading mode and gain an authenticated-user nav state. The deploy target stays Vercel Hobby — Supabase is called directly from the browser via its JS client, no Vercel functions needed for v1.

## Constraints

- **Vercel Hobby + non-profit use only.** No paid functions. All persistence goes through Supabase REST/PostgREST + Supabase Auth.
- **Static-first architecture.** Every page must work as a fully static HTML file. Auth/data is hydrated client-side via `assets/supabase.js`. No SSR.
- **RLS-first security.** Postgres Row Level Security is the *only* enforcement layer for sensitive data. The static site can hide buttons; that's cosmetic. Anything the anon JWT or a member JWT can read or write MUST be locked by an RLS policy regardless of UI hiding.
- **Bilingual i18n preserved** (SQ default, EN switch via existing `LangState` in `assets/app.js`). New strings added to both dictionaries.
- **Domain stays `prishtina038.cc`.** Supabase project URL is separate (`<project>.supabase.co`); cross-origin requests permitted by Supabase by default with the project's anon key.
- **Free tier headroom.** Supabase Free: 50k MAU, 500 MB DB, 1 GB file storage, 2 GB egress. Club has ~47 members + parents + applicants → far under. Note: free projects pause after 7 days of zero requests — set up an uptime ping (Step VIII.4) once production traffic starts.
- **No commercial transactions on the site.** The "Pay dues" button on the member portal opens an external Stripe / bank-transfer instructions page (or `mailto:`), NOT an in-page checkout. Embedding payment processing flips the site into "commercial" territory and violates Vercel Hobby ToS.
- **Reuse the design verbatim.** The Downloads bundle is pixel-perfect; this plan only adds JS wiring and removes prototype placeholders.
- **Do not break existing public pages.** `index`, `about`, `sections`, `section-mtb`, `events`, `join` must continue to serve fully static (no Supabase calls on first byte). Auth is opt-in via a "Sign in" link in the nav.

## Current State

After the previous PLAN_KCP038_SITE.md implementation:

- Deployed to `https://kcprishtina038.vercel.app` (auto-deploys from `main` on GitHub `zerogravitysolutions/kcprishtina038`).
- 6 public pages, all 200, all headers correctly applied.
- `assets/app.js` (605 lines) — i18n dictionary + `LangState` + countdown + scroll-reveal. No backend.
- `join.html` form posts to `mailto:info@prishtina038.cc` (Step IV.2 of prior plan) — must be re-pointed to Supabase in this plan.
- No user accounts, no DB, no admin, no member-facing state.

The new design bundle at `/Users/qendrimpllnaa/Downloads/KÇ Prishtina 038/` is NOT in the repo yet — Phase I copies it in.

## Phases

### Phase I — Bring new design files into the repo (45 min)

**Depends on:** nothing.
**Output:** All 15 new pages + admin shell live at their final paths; the site visually grows from 6 routes to ~21 routes (12 admin + 3 member/auth + 6 public).

#### Step I.1 — Copy new top-level pages
**Files:**
- `login.html` (new, copy from `Downloads/KÇ Prishtina 038/login.html`)
- `member-portal.html` (new, copy)
- `member-profile.html` (new, copy)

**Implementation:**
```bash
SRC="/Users/qendrimpllnaa/Downloads/KÇ Prishtina 038"
cp "$SRC/login.html"          login.html
cp "$SRC/member-portal.html"  member-portal.html
cp "$SRC/member-profile.html" member-profile.html
```

**Verification:**
- [ ] Three files at repo root, byte-identical to source.
- [ ] `python3 -m http.server` smoke test: each page renders the design.

**Risk:** Pages reference `assets/styles.css` and `assets/app.js` (which already exist at repo root). No path rewriting needed — same convention as existing pages.

#### Step I.2 — Add the `admin/` workspace
**Files:**
- `admin/` directory (new) with 12 HTML pages + `_shell.js` + `styles.css`

**Implementation:**
```bash
cp -R "$SRC/admin" admin
```

**Verification:**
- [ ] `ls admin/*.html | wc -l` → 12.
- [ ] `admin/styles.css` and `admin/_shell.js` present.
- [ ] In a browser, `/admin/dashboard` renders the design (icons, sidebar, KPI tiles).

**Risk:** None. Admin pages reference `../assets/logo.jpg` and `../assets/app.js` — `../` from `admin/` resolves to repo root, paths are valid.

#### Step I.3 — Add a "Sign in" link to the public nav
**Requirement:** The public site currently has no entry point to the new auth area. Add a single "Identifikohu" link to the nav on `index.html` / `about.html` / `sections.html` / `section-mtb.html` / `events.html` / `join.html`. (The link points to `/login`. Once authenticated, JS swaps it for "Llogaria ime" → `/member-portal` or "Admin" → `/admin/dashboard` based on role.)

**Files:**
- `index.html`, `about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html` — nav `<div class="nav-right">` block (lines ~257-266 of `index.html` after Phase III.1 meta expansion; similar location in others).

**Implementation:**
Add one anchor in `.nav-right` between the lang-pill and the ember CTA on each page:
```html
<a class="nav-signin" href="login.html" id="nav-signin" data-i18n="nav.signin">Identifikohu</a>
```

Add the CSS rule to `assets/styles.css`:
```css
.nav-signin {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ink) 18%, transparent);
  color: var(--ink-2);
  transition: background .15s, color .15s;
}
.nav-signin:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.nav-signin.is-authed { background: var(--ember); color: var(--paper); border-color: var(--ember); }
```

Add `nav.signin: "Identifikohu" / "Sign in"` to both `I18N.sq` and `I18N.en` in `assets/app.js`.

A later step (II.3) replaces this anchor's `href` + label at runtime based on session.

**Verification:**
- [ ] Each public page has a visible "Identifikohu" pill in the nav.
- [ ] Clicking it lands on `/login` and the design renders.
- [ ] SQ → EN toggle changes "Identifikohu" → "Sign in".

### Phase II — Supabase project bootstrap + client (1.5 h)

**Depends on:** Phase I.
**Output:** A Supabase project is reachable from the browser; every page can call `await supa.auth.getUser()` and get either `null` or a populated user.

#### Step II.1 — Create the Supabase project
**Manual (user does this in Supabase dashboard at supabase.com/dashboard):**
1. New project → name `kcprishtina038` → region closest to Prishtina (`eu-central-1` Frankfurt) → choose a strong DB password (save in 1Password or similar).
2. Wait ~2 min for provisioning.
3. **Project Settings → API → copy two values:**
   - `Project URL` (looks like `https://xxxxxxxx.supabase.co`)
   - `anon` `public` key (long JWT)
4. **Project Settings → Authentication → URL Configuration:**
   - Site URL: `https://prishtina038.cc` (or the current Vercel URL until the domain is configured)
   - Additional Redirect URLs: `https://kcprishtina038.vercel.app/**`, `http://localhost:*/**` (for local dev)
5. **Authentication → Providers:**
   - Email: enabled, "Confirm email" ON.
   - Google OAuth: optional for v1 (the login page already has the Google button — wire later in Step III.5 if desired).

**Verification:**
- [ ] User reports Project URL + anon key to the implementer (Claude).
- [ ] `curl <project-url>/rest/v1/` returns 401 (proves project is reachable; 401 because no auth header sent).

**Risk:** Wrong region adds 50-100ms latency from Kosovo. Frankfurt is the best EU-Central choice for Pristina (≈ 1500 km direct).

#### Step II.2 — Add the Supabase JS client + a thin wrapper
**Files:**
- `assets/supabase.js` (new) — initialization + helpers.
- Public pages and protected pages will `<script type="module" src="assets/supabase.js"></script>` instead of (or alongside) plain `<script src="assets/app.js"></script>`.

**Implementation:**
```js
// assets/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45/+esm";

// These two values are public (anon key is safe to ship to the browser).
// RLS in Postgres is the actual security boundary.
const SUPABASE_URL  = "__SUPABASE_URL__";
const SUPABASE_ANON = "__SUPABASE_ANON_KEY__";

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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
    .select("id, full_name, role, section_id, avatar_url, status")
    .eq("id", session.user.id)
    .single();
  if (error) { console.error("profile fetch", error); return null; }
  return data;
}

// Page-guard helper used by protected pages.
// Optionally restrict to a specific role set.
export async function requireAuth({ roles = null, redirect = "login.html" } = {}) {
  const profile = await getProfile();
  if (!profile) { window.location.replace(redirect); return null; }
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
```

**Build-time substitution of placeholders:** because there's no build step, the two `__SUPABASE_*__` placeholders are replaced by a `prebuild.sh` script that runs on Vercel before publish:
- Add a Vercel "Build Command": `bash ./prebuild.sh` (this is the *only* build step we add).
- `prebuild.sh` reads `$SUPABASE_URL` and `$SUPABASE_ANON_KEY` from Vercel env, runs `sed` to substitute in `assets/supabase.js`.
- Vercel env vars are added at Project Settings → Environment Variables.

`prebuild.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY not set}"
# In-place replace placeholders. macOS sed needs '' after -i; Linux (Vercel) does not.
SED_OPT=""
[[ "$(uname -s)" == "Darwin" ]] && SED_OPT="''"
sed -i $SED_OPT "s|__SUPABASE_URL__|$SUPABASE_URL|g" assets/supabase.js
sed -i $SED_OPT "s|__SUPABASE_ANON_KEY__|$SUPABASE_ANON_KEY|g" assets/supabase.js
echo "prebuild: supabase.js placeholders substituted"
```

Update `vercel.json` to add `buildCommand`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bash ./prebuild.sh",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [ ...existing... ]
}
```

**Verification:**
- [ ] Locally: copy `.env.example` to `.env`, fill in values, run `source .env && bash prebuild.sh && grep -v "__SUPABASE" assets/supabase.js | head -10` — placeholders are gone.
- [ ] On Vercel: deploy logs show `prebuild: supabase.js placeholders substituted`.
- [ ] In the browser DevTools console on the deployed site: `import("/assets/supabase.js").then(m => m.supa.auth.getSession())` resolves with `{data: {session: null}, error: null}`.

**Risk:** The anon key in `supabase.js` is now world-readable on every page that includes the script. **This is intended and safe** — Supabase anon keys are designed for browser shipment; RLS is the security layer. If the anon key is ever leaked-by-mistake (e.g., wrong project), rotate it in Supabase dashboard → API → "Reset API keys" and redeploy.

#### Step II.3 — Wire the nav "Sign in" link to session state
**Files:**
- `assets/app.js` — append a small DOMContentLoaded hook.

**Implementation:**
```js
// At the end of assets/app.js, BEFORE the closing of any IIFE:
(async function navSigninState() {
  const link = document.getElementById("nav-signin");
  if (!link) return;
  try {
    const { getProfile } = await import("./supabase.js");
    const profile = await getProfile();
    if (!profile) return; // stays "Identifikohu" → login.html
    link.classList.add("is-authed");
    if (profile.role === "member") {
      link.href = "member-portal.html";
      link.textContent = (LangState?.get?.() === "en" ? "My account" : "Llogaria ime");
    } else {
      link.href = "admin/dashboard.html";
      link.textContent = "Admin";
    }
  } catch (e) { /* offline / Supabase down → leave default */ }
})();
```

Add `nav.account: "Llogaria ime" / "My account"` to the `I18N` dictionary.

**Verification:**
- [ ] Logged-out: nav shows "Identifikohu", clicking goes to /login.
- [ ] Logged-in as member: nav shows "Llogaria ime", ember-tinted, clicking goes to /member-portal.
- [ ] Logged-in as admin/editor/staff/coach: nav shows "Admin", clicking goes to /admin/dashboard.

### Phase III — Schema, RLS, and seed (5 h)

**Depends on:** Phase II.1 (project must exist).
**Output:** Database has 14 tables + 5 helper functions + RLS on every table + an initial admin row.

All SQL goes under `supabase/migrations/` as numbered files. Each file is one logical change so they can be re-run idempotently.

#### Step III.1 — Set up Supabase CLI + migrations folder
**Files:**
- `supabase/config.toml` (new) — minimal project config.
- `supabase/migrations/` (new directory).
- `.gitignore` add: `supabase/.temp/`, `supabase/.branches/`.
- `README.md` get a "Database migrations" section.

**Implementation:**

Install Supabase CLI locally (`brew install supabase/tap/supabase`). Then:
```bash
cd /Users/qendrimpllnaa/Documents/workspace/kcprishtina038
supabase init             # creates supabase/ scaffolding
supabase link --project-ref <project-ref>   # from project URL
```

Migrations live in `supabase/migrations/<timestamp>_<name>.sql`. Apply with:
```bash
supabase db push          # applies un-applied migrations to remote
```

**Verification:**
- [ ] `supabase --version` works.
- [ ] `supabase/config.toml` exists and references the linked project.
- [ ] First `supabase db push` runs against an empty DB without error (no migrations yet, no-op).

#### Step III.2 — Migration: enums + utility functions
**File:** `supabase/migrations/0001_enums_and_utils.sql`

```sql
-- Role enum (5 values, ordered loosely by privilege).
create type public.user_role as enum ('admin','editor','staff','coach','member');

-- Application status.
create type public.application_status as enum ('pending','approved','rejected','waitlist','withdrawn');

-- Member status.
create type public.member_status as enum ('active','inactive','suspended','pending');

-- Event status.
create type public.event_status as enum ('draft','published','cancelled','done');
create type public.event_type   as enum ('race','ride','camp','training');
create type public.registration_status as enum ('registered','waitlist','cancelled','checked_in','dnf','dns');

-- Dues status.
create type public.dues_status as enum ('paid','unpaid','overdue','waived');

-- Attendance status.
create type public.attendance_status as enum ('present','absent','late','excused');

-- News status.
create type public.content_status as enum ('draft','published','archived');

-- Sponsor tier.
create type public.sponsor_tier as enum ('title','technical','partner','supporter');

-- Helper: current role, NULL if unauthenticated.
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Helper: is the current user one of the roles in `roles`?
create or replace function public.has_role(roles public.user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_role() = any(roles), false)
$$;

-- Helper: is the current user the coach of `target_section_id`?
create or replace function public.is_coach_of(target_section_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles
                where id = auth.uid() and role = 'coach' and section_id = target_section_id)
$$;

-- Helper: updated_at trigger.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
```

**Verification:**
- [ ] `select unnest(enum_range(null::public.user_role));` returns 5 rows.
- [ ] `select public.current_role();` returns NULL when unauthenticated.

#### Step III.3 — Migration: core tables (profiles, sections)
**File:** `supabase/migrations/0002_core_tables.sql`

```sql
-- Sections (the 6 disciplines).
create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z][a-z0-9_-]*$'),
  display_order int not null,
  name_sq      text not null,
  name_en      text not null,
  description_sq text,
  description_en text,
  coach_id     uuid,  -- FK to profiles, added after profiles exists
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger sections_updated_at before update on public.sections
  for each row execute function public.set_updated_at();

-- Profiles: 1:1 with auth.users.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  email           text not null unique,
  phone           text,
  dob             date,
  role            public.user_role not null default 'member',
  section_id      uuid references public.sections(id) on delete set null,
  avatar_url      text,
  bio             text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  status          public.member_status not null default 'pending',
  joined_at       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_role_idx     on public.profiles(role);
create index profiles_section_idx  on public.profiles(section_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Now that profiles exists, complete the sections.coach_id FK.
alter table public.sections
  add constraint sections_coach_fk foreign key (coach_id)
  references public.profiles(id) on delete set null;

-- Auto-create a profile row when an auth user is created.
-- Sourced from raw_user_meta_data fields the join form submits.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    'member',
    'pending'
  );
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Verification:**
- [ ] `\d public.profiles` shows the schema.
- [ ] Insert a row via Supabase dashboard's SQL editor: `insert into auth.users ...` then `select * from public.profiles` shows the auto-created row.

#### Step III.4 — Migration: applications + events + categories + registrations
**File:** `supabase/migrations/0003_applications_events.sql`

```sql
create table public.applications (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null,
  phone         text,
  age           int  check (age between 6 and 120),
  section_id    uuid references public.sections(id) on delete set null,
  experience    text check (experience in ('beginner','intermediate','advanced','racer')),
  notes         text,
  status        public.application_status not null default 'pending',
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index applications_status_idx on public.applications(status);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique,
  title_sq              text not null,
  title_en              text,
  type                  public.event_type not null,
  status                public.event_status not null default 'draft',
  section_id            uuid references public.sections(id) on delete set null,
  start_at              timestamptz not null,
  end_at                timestamptz,
  location              text,
  distance_km           numeric(6,1),
  elevation_m           int,
  description_sq        text,
  description_en        text,
  registration_open_at  timestamptz,
  registration_close_at timestamptz,
  cover_media_id        uuid,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index events_start_idx on public.events(start_at);
create index events_status_idx on public.events(status);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_categories (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  max_riders  int,
  display_order int not null default 0,
  unique (event_id, name)
);

create table public.event_registrations (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  member_id       uuid not null references public.profiles(id) on delete cascade,
  category_id     uuid references public.event_categories(id) on delete set null,
  status          public.registration_status not null default 'registered',
  bib_number      int,
  registered_at   timestamptz not null default now(),
  notes           text,
  unique (event_id, member_id)
);
create index registrations_event_idx  on public.event_registrations(event_id);
create index registrations_member_idx on public.event_registrations(member_id);
```

**Verification:**
- [ ] Insert a sample event + 3 categories + 2 registrations. Foreign keys hold.
- [ ] `select * from public.events join public.event_categories on event_categories.event_id = events.id` joins cleanly.

#### Step III.5 — Migration: results + news + media + sponsors
**File:** `supabase/migrations/0004_content_tables.sql`

```sql
create table public.results (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  category_id uuid references public.event_categories(id) on delete set null,
  member_id   uuid references public.profiles(id) on delete set null,
  rider_name_override text,   -- for guest / one-off riders not in profiles
  position    int,
  time_seconds int,
  points      int,
  notes       text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (member_id is not null or rider_name_override is not null)
);
create index results_event_idx  on public.results(event_id);
create index results_member_idx on public.results(member_id);

create table public.media (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,    -- path inside the Supabase Storage 'media' bucket
  filename     text not null,
  mime_type    text,
  width        int,
  height       int,
  byte_size    bigint,
  alt          text,
  caption      text,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Backfill the cover-media FK now that media exists.
alter table public.events
  add constraint events_cover_media_fk foreign key (cover_media_id)
  references public.media(id) on delete set null;

create table public.news (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title_sq      text not null,
  title_en      text,
  body_sq       text not null,
  body_en       text,
  cover_media_id uuid references public.media(id) on delete set null,
  status        public.content_status not null default 'draft',
  author_id     uuid references public.profiles(id) on delete set null,
  published_at  timestamptz,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index news_status_idx on public.news(status);
create index news_published_idx on public.news(published_at desc);
create trigger news_updated_at before update on public.news
  for each row execute function public.set_updated_at();

create table public.sponsors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  tier           public.sponsor_tier not null,
  logo_media_id  uuid references public.media(id) on delete set null,
  role_sq        text,
  role_en        text,
  body_sq        text,
  body_en        text,
  website_url    text,
  contract_start date,
  contract_end   date,
  display_order  int not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger sponsors_updated_at before update on public.sponsors
  for each row execute function public.set_updated_at();
```

#### Step III.6 — Migration: dues + attendance + settings + audit
**File:** `supabase/migrations/0005_finance_attendance_settings.sql`

```sql
create table public.dues (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  period         date not null,   -- first-of-month, e.g. 2026-05-01
  amount_eur     numeric(8,2) not null,
  status         public.dues_status not null default 'unpaid',
  paid_at        timestamptz,
  paid_method    text check (paid_method in ('cash','bank','online','waived')),
  recorded_by    uuid references public.profiles(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, period)
);
create index dues_member_idx on public.dues(member_id);
create index dues_status_idx on public.dues(status);
create trigger dues_updated_at before update on public.dues
  for each row execute function public.set_updated_at();

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  session_date   date not null,
  section_id     uuid references public.sections(id) on delete set null,
  status         public.attendance_status not null default 'present',
  notes          text,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (member_id, session_date)
);
create index attendance_section_date_idx on public.attendance(section_id, session_date);

-- Key-value settings (club-wide config).
create table public.settings (
  key            text primary key,
  value          jsonb not null,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.audit_log (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,         -- 'role.change', 'application.approve', etc.
  entity_type    text not null,
  entity_id      text,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index audit_log_actor_idx  on public.audit_log(actor_id);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
```

#### Step III.7 — Migration: RLS policies (THE CRITICAL ONE)
**File:** `supabase/migrations/0006_rls_policies.sql`

Enable RLS on every table, then add policies. Pattern: each table gets `select` / `insert` / `update` / `delete` policies as needed; the matrix below summarises.

```sql
-- ============================================================
-- Enable RLS everywhere
-- ============================================================
alter table public.sections             enable row level security;
alter table public.profiles             enable row level security;
alter table public.applications         enable row level security;
alter table public.events               enable row level security;
alter table public.event_categories     enable row level security;
alter table public.event_registrations  enable row level security;
alter table public.results              enable row level security;
alter table public.media                enable row level security;
alter table public.news                 enable row level security;
alter table public.sponsors             enable row level security;
alter table public.dues                 enable row level security;
alter table public.attendance           enable row level security;
alter table public.settings             enable row level security;
alter table public.audit_log            enable row level security;

-- ============================================================
-- SECTIONS — readable by everyone, writable by admin/editor
-- ============================================================
create policy sections_select_all on public.sections
  for select using (true);
create policy sections_write_admin on public.sections
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[]))
  with check (has_role(array['admin','editor']::user_role[]));

-- ============================================================
-- PROFILES — own row readable always; staff/admin see all
-- ============================================================
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_select_staff on public.profiles
  for select using (has_role(array['admin','editor','staff','coach']::user_role[]));
-- Coach can only see profiles in their section (for the roster page).
-- Already covered by the staff policy above; tightening in a later RPC if needed.

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Members cannot self-promote: role and status are out of scope here.
    -- The CHECK runs on the *new* row, so we forbid changes to those fields:
    and role = (select role from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );
create policy profiles_update_admin on public.profiles
  for update using (has_role(array['admin']::user_role[]));
create policy profiles_insert_admin on public.profiles
  for insert with check (has_role(array['admin']::user_role[]));
-- Note: normal profile creation goes through the on_auth_user_created trigger,
-- which is SECURITY DEFINER and bypasses RLS.

-- ============================================================
-- APPLICATIONS — PUBLIC INSERT (the join form); staff/admin read+update
-- ============================================================
create policy applications_insert_public on public.applications
  for insert to anon, authenticated with check (true);
create policy applications_select_staff on public.applications
  for select to authenticated
  using (has_role(array['admin','editor','staff']::user_role[]));
create policy applications_update_staff on public.applications
  for update to authenticated
  using (has_role(array['admin','staff']::user_role[]))
  with check (has_role(array['admin','staff']::user_role[]));
create policy applications_delete_admin on public.applications
  for delete to authenticated using (has_role(array['admin']::user_role[]));

-- ============================================================
-- EVENTS — published readable by everyone (incl. anon); all by staff
-- ============================================================
create policy events_select_published on public.events
  for select using (status = 'published');
create policy events_select_staff on public.events
  for select to authenticated
  using (has_role(array['admin','editor','staff','coach']::user_role[]));
create policy events_write_editor on public.events
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[])
         or is_coach_of(section_id))
  with check (has_role(array['admin','editor']::user_role[])
              or is_coach_of(section_id));

create policy event_categories_select_all on public.event_categories
  for select using (true);
create policy event_categories_write_editor on public.event_categories
  for all to authenticated
  using (
    exists(
      select 1 from public.events e where e.id = event_id
      and (has_role(array['admin','editor']::user_role[]) or is_coach_of(e.section_id))
    )
  )
  with check (
    exists(
      select 1 from public.events e where e.id = event_id
      and (has_role(array['admin','editor']::user_role[]) or is_coach_of(e.section_id))
    )
  );

-- ============================================================
-- EVENT_REGISTRATIONS — members RSVP own; staff/coach see all in scope
-- ============================================================
create policy registrations_select_own on public.event_registrations
  for select to authenticated using (member_id = auth.uid());
create policy registrations_select_staff on public.event_registrations
  for select to authenticated
  using (has_role(array['admin','editor','staff','coach']::user_role[]));
create policy registrations_insert_self on public.event_registrations
  for insert to authenticated with check (member_id = auth.uid());
create policy registrations_update_self on public.event_registrations
  for update to authenticated using (member_id = auth.uid());
create policy registrations_write_staff on public.event_registrations
  for all to authenticated
  using (has_role(array['admin','staff','coach']::user_role[]))
  with check (has_role(array['admin','staff','coach']::user_role[]));

-- ============================================================
-- RESULTS — public read; editor/coach write
-- ============================================================
create policy results_select_all on public.results
  for select using (true);
create policy results_write_editor on public.results
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[])
         or exists(select 1 from public.events e where e.id = event_id and is_coach_of(e.section_id)))
  with check (has_role(array['admin','editor']::user_role[])
              or exists(select 1 from public.events e where e.id = event_id and is_coach_of(e.section_id)));

-- ============================================================
-- MEDIA — public read; editor write
-- ============================================================
create policy media_select_all on public.media for select using (true);
create policy media_write_editor on public.media
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[]))
  with check (has_role(array['admin','editor']::user_role[]));

-- ============================================================
-- NEWS — public read PUBLISHED; editor write all
-- ============================================================
create policy news_select_published on public.news
  for select using (status = 'published');
create policy news_select_editor on public.news
  for select to authenticated
  using (has_role(array['admin','editor']::user_role[]));
create policy news_write_editor on public.news
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[]))
  with check (has_role(array['admin','editor']::user_role[]));

-- ============================================================
-- SPONSORS — public read active; editor write
-- ============================================================
create policy sponsors_select_active on public.sponsors
  for select using (active = true);
create policy sponsors_write_editor on public.sponsors
  for all to authenticated
  using (has_role(array['admin','editor']::user_role[]))
  with check (has_role(array['admin','editor']::user_role[]));

-- ============================================================
-- DUES — own read; staff/admin all
-- ============================================================
create policy dues_select_own on public.dues
  for select to authenticated using (member_id = auth.uid());
create policy dues_select_staff on public.dues
  for select to authenticated
  using (has_role(array['admin','staff']::user_role[]));
create policy dues_write_staff on public.dues
  for all to authenticated
  using (has_role(array['admin','staff']::user_role[]))
  with check (has_role(array['admin','staff']::user_role[]));

-- ============================================================
-- ATTENDANCE — own read; coach/staff write in scope
-- ============================================================
create policy attendance_select_own on public.attendance
  for select to authenticated using (member_id = auth.uid());
create policy attendance_select_staff on public.attendance
  for select to authenticated
  using (has_role(array['admin','staff','coach']::user_role[]));
create policy attendance_write_coach on public.attendance
  for all to authenticated
  using (has_role(array['admin','staff']::user_role[]) or is_coach_of(section_id))
  with check (has_role(array['admin','staff']::user_role[]) or is_coach_of(section_id));

-- ============================================================
-- SETTINGS — read public for designated keys; admin write
-- ============================================================
-- Public settings are exposed via a SECURITY DEFINER view (see 0007).
-- The raw table is admin-only.
create policy settings_admin_all on public.settings
  for all to authenticated
  using (has_role(array['admin']::user_role[]))
  with check (has_role(array['admin']::user_role[]));

-- ============================================================
-- AUDIT_LOG — admin read; system writes via SECURITY DEFINER (no direct insert)
-- ============================================================
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (has_role(array['admin']::user_role[]));
-- No insert/update/delete policies → no direct client writes.
```

**Verification:**
- [ ] As anon JWT: `select * from public.events` returns only published events.
- [ ] As member JWT: `select * from public.profiles` returns one row (own).
- [ ] As admin JWT: same query returns all rows.
- [ ] As member JWT: `update profiles set role='admin' where id=auth.uid()` fails with RLS error.
- [ ] As member JWT: `insert into applications (...) values (...)` succeeds (public insert path).

**Risk:** RLS policy bugs are silent — a too-permissive policy leaks data, a too-restrictive one breaks the UI. Mitigation: a test SQL script (Step III.9) runs JWT-impersonation queries against every table-role combination and asserts pass/fail.

#### Step III.8 — Migration: seed the 6 sections + the first admin
**File:** `supabase/migrations/0007_seed_sections.sql`

```sql
insert into public.sections (slug, display_order, name_sq, name_en, description_sq, description_en) values
  ('road',   1, 'Rrugë',                 'Road',          'Sezoni i pranverës–vjeshtës. Garat kombëtare të FÇK, Granfondo, dhe etapat rajonale.',
   'Spring–autumn season. FÇK national races, Granfondos, and regional stage races.'),
  ('mtb',    2, 'MTB',                   'MTB',           'Cross-country mbi Germinë, Sharrin dhe Prokletijet.',
   'Cross-country across Germia, Sharri and the Accursed Mountains.'),
  ('gravel', 3, 'Gravel',                'Gravel',        'E reja e klubit. Gara aventureske dhe ekspedita të hapura.',
   'The newest section. Adventure events and open expeditions.'),
  ('track',  4, 'Trek',                  'Track',         'Disiplinë e shkurtër — sprint, keirin, persecution.',
   'The short discipline — sprint, keirin, pursuit.'),
  ('youth',  5, 'Akademia e të rinjve',  'Youth Academy', 'Çiklistët e ardhshëm të Kosovës — moshat 9–17 vjeç.',
   'The future of Kosovar cycling — ages 9–17.'),
  ('women',  6, 'Femra',                 'Women''s',      'Programi i çiklizmit të femrave.',
   'The women''s cycling program.');

-- Initial admin: insert ONE row in auth.users manually via the dashboard
-- (Authentication → Users → Add user → email + password), THEN run:
-- update public.profiles set role='admin', status='active' where email='owner@example.com';
-- Until that runs, no one has admin access — RLS is effectively closed.
```

**Verification:**
- [ ] `select count(*) from public.sections;` → 6.
- [ ] All slugs lowercase, no spaces.

#### Step III.9 — RLS test script
**File:** `supabase/tests/rls.sql` (new) — runs locally with `supabase test db`.

Per-role assertions (excerpt):
```sql
-- Test: anon cannot select profiles
set role anon;
do $$ begin
  perform 1 from public.profiles limit 1;
  raise exception 'expected RLS to block anon read on profiles';
exception when others then null;
end $$;
-- ... 20+ similar checks
```

Full file omitted here but ~60 lines covering: read leaks, write escalations, cross-section coach access, self-promotion blocks.

### Phase IV — Wire login + member portal (4 h)

**Depends on:** Phase II, Phase III.
**Output:** A member can sign up via the join form, get approved by an admin, log in, see their portal.

#### Step IV.1 — Wire `login.html` to Supabase Auth
**Files:**
- `login.html` (modify `<script>` block at the bottom).

Replace the demo `handleLogin()` (which just `window.location.href`'s based on tab) with real auth:
```js
import { supa, getProfile } from "./assets/supabase.js";

async function handleLogin() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  btn.firstChild.textContent = "…";
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    btn.disabled = false; btn.firstChild.textContent = " ";
    alert(error.message); return;
  }
  const profile = await getProfile();
  if (!profile) { alert("Profili nuk u gjet."); return; }
  if (profile.status !== 'active') { alert("Anëtarësia juaj është ende në pritje."); return; }
  window.location.href = profile.role === "member" ? "member-portal.html" : "admin/dashboard.html";
}
```

The role-tab toggle becomes cosmetic only (it changes hint text). Real routing comes from `profile.role`.

**Verification:**
- [ ] Wrong password → alert with Supabase error.
- [ ] Correct password, role=member → lands on `/member-portal`.
- [ ] Correct password, role=admin → lands on `/admin/dashboard`.

#### Step IV.2 — Wire forgot-password
The login page has a "Harruat fjalëkalimin?" link. Wire it:
```js
document.querySelector("[href='#'][tabindex='-1']").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = prompt("Email-i juaj?");
  if (!email) return;
  await supa.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
  alert("Email-i për resetim u dërgua.");
});
```

Add `reset-password.html` (new page) that calls `supa.auth.updateUser({ password })`.

#### Step IV.3 — Convert join form from `mailto:` to Supabase
**Files:**
- `join.html` — form action + JS handler.

Replace `<form action="mailto:...">` with `<form id="join-form">` and add:
```js
import { supa } from "./assets/supabase.js";
document.getElementById("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target._gotcha.value) return;  // bot
  const fd = new FormData(e.target);
  const sectionSlug = fd.get("section");
  const { data: section } = await supa.from("sections").select("id").eq("slug", sectionSlug).single();
  const { error } = await supa.from("applications").insert({
    full_name: fd.get("name"),
    email: fd.get("email"),
    phone: fd.get("phone"),
    age: Number(fd.get("age")),
    section_id: section?.id ?? null,
    experience: fd.get("experience"),
    notes: fd.get("notes")
  });
  const msg = error ? `Gabim: ${error.message}` : "Faleminderit — ju kontaktojmë brenda 5 ditëve.";
  alert(msg);
  if (!error) e.target.reset();
});
```

#### Step IV.4 — Wire `member-portal.html`
Add a `<script type="module">` at the bottom:
```js
import { requireAuth, supa, signOut } from "./assets/supabase.js";
const profile = await requireAuth();
if (!profile) throw "redirected";

// Personalise "Mirë se erdhe, <em>{name}</em>"
document.querySelector(".portal-top h1 em").textContent = profile.full_name.split(" ")[0];

// Fetch upcoming registrations
const { data: nextRace } = await supa
  .from("event_registrations")
  .select("event:events(*), category:event_categories(name)")
  .eq("member_id", profile.id)
  .gte("events.start_at", new Date().toISOString())
  .order("events.start_at", { ascending: true })
  .limit(1)
  .maybeSingle();

// Fetch dues
const { data: dues } = await supa
  .from("dues")
  .select("*")
  .eq("member_id", profile.id)
  .order("period", { ascending: false })
  .limit(6);

// Render
// ... DOM updates against the existing static HTML structure
document.querySelector("[data-signout]")?.addEventListener("click", signOut);
```

**Verification:**
- [ ] Unauthenticated visit → redirect to `/login`.
- [ ] Authenticated member → portal renders with their name, upcoming race, dues.
- [ ] Sign-out link clears session, redirect to `/login`.

#### Step IV.5 — Wire `member-profile.html`
Similar pattern: load own profile, render an editable form, save back. RLS allows own updates but blocks role/status changes (CHECK clause in policy `profiles_update_own`).

### Phase V — Wire the 12 admin pages (12 h)

**Depends on:** Phase IV (auth must work).
**Output:** Every admin nav item lands on a working page wired to its corresponding table.

Each admin page follows the same pattern:
1. `requireAuth({ roles: [...] })` at top — block non-staff.
2. Render `_shell.js`.
3. Fetch list from Supabase.
4. Render rows into the existing static table markup.
5. Wire create/edit/delete handlers.

Per-page detail compressed because the pattern is uniform. Time estimates assume the static HTML is unchanged and only `<script type="module">` is added.

| Step | Page | Roles | Tables touched | Time |
|------|------|-------|----------------|------|
| V.1 | `admin/dashboard.html`     | admin,editor,staff,coach | summaries (kpi counts) | 1 h |
| V.2 | `admin/applications.html`  | admin,staff              | applications + approve/reject RPC | 1.5 h |
| V.3 | `admin/members.html`       | admin,staff,coach        | profiles (filterable by section/role/status) | 1.5 h |
| V.4 | `admin/member-detail.html` | admin,staff,coach        | profiles + dues + registrations + attendance | 1.5 h |
| V.5 | `admin/sections.html`      | admin,editor             | sections (edit name/desc/coach) | 0.5 h |
| V.6 | `admin/staff.html`         | admin                    | profiles where role ≠ member; role change UI | 1 h |
| V.7 | `admin/events.html`        | admin,editor,coach       | events + categories | 1 h |
| V.8 | `admin/results.html`       | admin,editor,coach       | results | 1 h |
| V.9 | `admin/news.html`          | admin,editor             | news (draft/publish workflow) | 1 h |
| V.10| `admin/media.html`         | admin,editor             | media + Supabase Storage upload | 1 h |
| V.11| `admin/sponsors.html`      | admin,editor             | sponsors | 0.5 h |
| V.12| `admin/settings.html`      | admin                    | settings (KV pairs) | 0.5 h |

**Step V.2 — Application approve/reject RPC (the trickier one):**

When admin clicks "Approve", a *new* `auth.users` row + a corresponding `profiles` row need to be created from the application data, and the application gets `status='approved'`. This must happen atomically. Create a SECURITY DEFINER RPC:

```sql
-- supabase/migrations/0008_approve_application_rpc.sql
create or replace function public.approve_application(app_id uuid, initial_password text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  app applications;
  new_user_id uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'not authorised';
  end if;
  select * into app from applications where id = app_id;
  if not found then raise exception 'application not found'; end if;
  if app.status <> 'pending' then raise exception 'application already processed'; end if;

  -- Create the auth user (Supabase JS server-side approach would use admin API;
  -- here we go through the dashboard or a separate invitation flow).
  -- For v1, we generate an invitation token and the member sets their own password via email.
  -- This RPC just flips the application status; the invite is sent via Supabase Edge Function in v2.

  update applications
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = app_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'application.approve', 'application', app_id::text, to_jsonb(app));

  return app_id;
end $$;
```

For v1: approve flips status; the actual auth.users + profile creation happens when admin clicks an "Invite" button which calls Supabase's password-reset / magic-link flow against the application email. The full automated approval is a v2 task (Phase VIII).

#### Step V.10 — Media library + Storage bucket
**Manual setup:** In Supabase Dashboard → Storage → New bucket → name `media`, public = true. Then in the SQL editor:
```sql
-- Bucket policies (separate from table RLS)
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');
create policy "media editor write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and has_role(array['admin','editor']::user_role[]));
-- + update + delete versions
```

The admin media page wires drag-and-drop upload to `supa.storage.from('media').upload(...)` and inserts the corresponding `public.media` row.

### Phase VI — Hook public pages to live data (3 h)

**Depends on:** Phase V (admin pages can populate the tables that drive public content).
**Output:** Public marketing pages (`index`, `events`, `sections`, etc.) read from Supabase where appropriate, falling back to static content if Supabase is down.

#### Step VI.1 — `events.html` upcoming races from DB
Replace the hardcoded `event-row` blocks with rows fetched at runtime. Falls back to static if `supa.from('events').select()` errors.

#### Step VI.2 — `index.html` countdown auto-targets next race
Today the countdown is hardcoded `2026-05-17T09:00:00`. After Phase V.7 events are in DB; fetch the next published event with `type='race'` and target *that* date.

#### Step VI.3 — `index.html` news cards from DB
Replace the 3 hardcoded news articles with the 3 newest `news` rows where `status='published'`.

#### Step VI.4 — `index.html` sponsors from DB
Replace hardcoded BikePlus / Novus blocks with rows from `sponsors where active=true order by display_order`.

#### Step VI.5 — `sections.html` + `section-mtb.html` from DB
Section descriptions, coach names come from `sections` joined with `profiles`.

Each step uses identical pattern: query → render → fallback. ~30 min each, so 2.5 h total.

### Phase VII — Testing + observability (2 h)

**Depends on:** Phases IV–VI.

#### Step VII.1 — RLS test suite
Run `supabase test db` against the local DB after every migration. Fail the CI if any assertion fails.

#### Step VII.2 — Smoke-test script
A Node-free Python script that uses `supabase-py` to walk the role matrix: anon, member, coach, staff, editor, admin × every table × {read, write, delete}. Expected pass/fail per cell. Run nightly.

#### Step VII.3 — Free-tier keepalive
Supabase pauses projects after 7 days idle. Add a Vercel cron (Hobby allows 1 cron) hitting `/health` on the Supabase project URL once a day. OR use UptimeRobot free (5-min interval) hitting the public site — site requests go through Vercel only; we need to ping Supabase directly. Simplest: add a single `<script>` on the public landing that fires a `supa.from('sections').select('id').limit(1)` — every visitor keeps the project warm.

### Phase VIII — Ops + handoff (1 h)

#### Step VIII.1 — Vercel env vars
In Vercel dashboard → Project Settings → Environment Variables, add:
- `SUPABASE_URL` = `https://<project>.supabase.co`
- `SUPABASE_ANON_KEY` = `<long anon JWT>`

Scope: Production + Preview + Development. Trigger a re-deploy so `prebuild.sh` substitutes the placeholders.

#### Step VIII.2 — Supabase email templates
In Supabase Dashboard → Authentication → Email Templates, customise:
- Confirm signup
- Magic link
- Reset password
- Invite

Brand them with the KÇ Prishtina 038 logo + ember/ink palette. Subject lines in Albanian.

#### Step VIII.3 — Backup strategy doc
Add `docs/RUNBOOK.md`:
- How to take a manual DB dump: `supabase db dump --linked > backup-$(date +%F).sql`
- Where backups live (recommend: weekly to a private GitHub Gist, encrypted).
- How to restore (test it once before going live).

#### Step VIII.4 — First admin handoff
Walkthrough doc / Loom for Qëndrim:
- How to create the first admin user (Supabase dashboard → Users → Add user, then `update profiles set role='admin' where email='...'`).
- How to invite a new staff/coach (current v1 = same dashboard path; v2 = invite button in `/admin/staff`).
- How to roll back a bad deploy (Vercel Deployments → Promote previous).
- How to read the audit log.

## Dependency Graph

```
Phase I  ──┐
           ▼
Phase II  ─┐                Phase III (independent of II)
           │                     │
           ▼                     ▼
        Phase II.3 (nav) ◄──── Phase III done
                                 │
        ┌────────────────────────┤
        ▼                        ▼
   Phase IV (auth+portal)   Phase V (admin pages)
        │                        │
        └────────────┬───────────┘
                     ▼
              Phase VI (public pages → DB)
                     │
                     ▼
              Phase VII (testing)
                     │
                     ▼
              Phase VIII (ops + handoff)
```

## Parameters Added

| Parameter | Type | Default | Config Location | Used By |
|-----------|------|---------|-----------------|---------|
| `SUPABASE_URL` | URL | (none — required) | Vercel env vars + `prebuild.sh` substitution | `assets/supabase.js` |
| `SUPABASE_ANON_KEY` | string (JWT) | (none — required) | Vercel env vars + `prebuild.sh` substitution | `assets/supabase.js` |
| Dues default amount | numeric | 25.00 EUR | `settings` table key `dues.default_amount_eur` | Admin members page when batch-creating dues |
| Site URL (for auth redirects) | URL | `https://prishtina038.cc` | Supabase dashboard, Auth → URL Configuration | password-reset, magic-link |

## Files Modified (Summary)

| File | Steps | Type |
|------|-------|------|
| `login.html` | I.1, IV.1, IV.2 | New (copy) + JS wiring |
| `member-portal.html` | I.1, IV.4 | New + JS wiring |
| `member-profile.html` | I.1, IV.5 | New + JS wiring |
| `reset-password.html` | IV.2 | New (created mid-implementation) |
| `admin/dashboard.html` | I.2, V.1 | New + JS |
| `admin/applications.html` | I.2, V.2 | New + JS |
| `admin/members.html` | I.2, V.3 | New + JS |
| `admin/member-detail.html` | I.2, V.4 | New + JS |
| `admin/sections.html` | I.2, V.5 | New + JS |
| `admin/staff.html` | I.2, V.6 | New + JS |
| `admin/events.html` | I.2, V.7 | New + JS |
| `admin/results.html` | I.2, V.8 | New + JS |
| `admin/news.html` | I.2, V.9 | New + JS |
| `admin/media.html` | I.2, V.10 | New + JS |
| `admin/sponsors.html` | I.2, V.11 | New + JS |
| `admin/settings.html` | I.2, V.12 | New + JS |
| `admin/_shell.js` | I.2 | New (copy) |
| `admin/styles.css` | I.2 | New (copy) |
| `assets/supabase.js` | II.2 | New |
| `assets/app.js` | I.3, II.3 | Append nav-signin hook + i18n keys |
| `assets/styles.css` | I.3 | Append `.nav-signin` rules |
| `index.html`, `about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html` | I.3 | Add signin link in nav |
| `events.html`, `index.html`, `sections.html`, `section-mtb.html` | VI.* | Replace hardcoded data with Supabase fetches |
| `join.html` | IV.3 | Form action → Supabase insert |
| `vercel.json` | II.2 | Add `buildCommand` |
| `prebuild.sh` | II.2 | New |
| `.env.example` | II.2 | New |
| `supabase/config.toml` | III.1 | New (Supabase CLI scaffolding) |
| `supabase/migrations/0001…0008.sql` | III.2–III.8, V.2 | 8 migration files |
| `supabase/tests/rls.sql` | III.9 | New |
| `docs/RUNBOOK.md` | VIII.3 | New |
| `README.md` | III.1, VIII | Add DB migration + env var sections |

## Open Questions

1. **Editor role — does Qëndrim want one assigned now or later?** Plan reserves the role; granting it is a one-row UPDATE in the admin staff page.
2. **Coach role — one per section, or can multiple coaches share?** Schema currently models 1-coach-per-section (`sections.coach_id`). If multiple coaches per section is needed, add a `coaches` join table. Confirm before V.5/V.6.
3. **Dues automation** — should the system auto-generate the next month's `dues` rows on the 1st of each month, or do staff create them manually? Auto-gen = a Supabase cron + Edge Function (free tier supports this). Defer to v2.
4. **Payment processing** — explicitly OUT of scope per the Vercel-Hobby commercial constraint. The "Pay dues" button on the member portal opens a static instructions page or `mailto:`. If you want online payment, we need to (a) move to Vercel Pro or (b) host the payment page elsewhere and link to it.
5. **Multi-coach event registrations** — when a coach for *road* logs a result for a *mtb* race, should that be allowed? Current RLS says no (coach scope = own section). Plan assumes section coaches stay in their lane; admin/editor cross-cuts.
6. **i18n for DB content** — every content table has `_sq` and `_en` columns. Adding a 3rd language later means a column-per-table migration. If trilingual is on the horizon, refactor to a `translations` table now. Otherwise leave it simple.

---

**Plan summary:**
- **8 phases, ~50 atomic steps**
- **~28 hours implementer time** spread across 1–2 weeks calendar time
- **Risk: MEDIUM** — first stateful surface, but well-contained behind Postgres RLS. The two biggest landmines (RLS misconfiguration, build-time env-var leakage) are explicitly tested.
- **Ready for `/plan-review` after Open Questions 1, 2, 3, 5, 6 are resolved.** Question 4 (payment) is a decision but doesn't block implementation.
