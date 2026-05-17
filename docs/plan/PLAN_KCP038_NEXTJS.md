# Plan: KÇ Prishtina 038 — Migrate to Next.js (App Router) + TypeScript

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-05-17 |
| Author | Claude + Qëndrim |
| Status | READY FOR IMPLEMENTATION |
| Estimated effort | ~20 hours implementer time (5 days at ~4 h/day calendar) |
| Files affected | ~70 new (Next.js app), ~25 deleted at cutover, 2 modified (`vercel.json`, `README.md`) |
| Risk level | MEDIUM — full frontend rewrite, but Supabase backend stays untouched and the site stays live throughout via gradual cutover. |

## Goal

Replace the vanilla HTML/CSS/JS frontend with a Next.js 15 App Router application using TypeScript and `@supabase/ssr`. Public marketing pages become static-rendered React server components; admin and member-portal pages become server components with client-component islands for interactivity. The Supabase project, all 11 migrations, the production data, the deploy URL, and the GitHub repo all stay unchanged. The output is a single Next.js app that replaces every existing page, organised feature-first under `app/`.

## Constraints

- **Backend untouched.** The Supabase project (`xutklvcsdgzmhxzexisb`) keeps its schema, RLS, seeds, admin user, and all production data. No migration is required to it.
- **No URL changes for the public site.** `/`, `/about`, `/sections`, `/events`, `/join`, `/login` all serve the same routes (Next.js gives those URLs via file-based routing).
- **Vercel Hobby tier only.** Non-commercial; no Pro features. Next.js works fully on Hobby including ISR, server components, and middleware.
- **Site stays live throughout.** Old `.html` files stay in place during the migration; each new Next.js page is built behind a feature flag pattern (deploy-but-route-around) until the cutover commit.
- **TypeScript everywhere.** Auto-generated Supabase types from `supabase gen types typescript --linked` provide compile-time query safety.
- **Bilingual SQ/EN preserved.** Use `next-intl` for type-safe i18n, populated from the existing `I18N` dictionary in `assets/app.js`.
- **Design system preserved.** `assets/styles.css` (847 lines) becomes `app/globals.css` verbatim. `admin/styles.css` becomes `app/admin/admin.css`. CSS variables for the ink/ember/paper palette stay identical.
- **No new external dependencies beyond Next.js + Supabase + next-intl.** No Tailwind, no shadcn/ui, no component library. The current CSS already encodes the design system; we keep it.
- **Env vars proper.** Supabase URL + publishable key move from hardcoded `assets/supabase.js` into Vercel environment variables. The Vercel ↔ Supabase Marketplace integration injects them automatically.
- **No data loss.** Pre-cutover, the existing `assets/photos/`, `assets/logo.jpg`, `assets/og-default.jpg` all move to `public/` (Next.js's static-asset convention).
- **Auth via cookies, not localStorage.** `@supabase/ssr` uses HTTP-only cookies, which makes auth state available to server components AND eliminates the localStorage-XSS risk we have today.

## Current State

The site is at commit `3e13732` on `main` of `github.com/zerogravitysolutions/kcprishtina038`, deployed at `https://kcprishtina038.vercel.app`.

**Inventory:**
- **10 top-level HTML pages** (1087 lines for `index.html`, ~400-700 for the others — totalling ~5800 lines).
- **12 admin HTML pages** (140-673 lines each — totalling ~4500 lines).
- **3 shared assets**: `assets/app.js` (634 lines, i18n + countdown + scroll reveal + nav hook), `assets/supabase.js` (66 lines, hardcoded URL + publishable key + auth helpers), `assets/styles.css` (847 lines, design system).
- **2 admin-shared assets**: `admin/_shell.js` (renders sidebar/topbar), `admin/admin.js` (boot + modal + helpers).
- **Supabase**: 11 migrations applied, ~14 tables, 41 RLS policies, 1 admin user, 6 seed sections, 7 settings keys. Connection details in `.env` (gitignored).
- **Vercel config**: `vercel.json` with `cleanUrls`, 4 security headers, asset cache. No build step today.
- **Deployment**: GitHub push to `main` → Vercel auto-deploys.

**Why migrate** (recap from chat):
- ~1000 lines of duplicated nav/header HTML across 23 pages.
- No type safety on Supabase queries — typos become runtime errors.
- Admin pages share structure (fetch list, render table, open modal) but are hand-rolled 12 times.
- `data-i18n` attribute binding is clunky vs `next-intl`'s typed strings.
- localStorage-stored session is XSS-readable; cookie-based sessions are stricter.
- Server-side rendering of admin tables eliminates the loading-flicker visible today.

## Phases

### Phase I — Bootstrap Next.js alongside existing site (1.5 h)

**Depends on:** nothing.
**Output:** Next.js builds and deploys on Vercel; old `.html` files still served at their existing URLs through this phase.

#### Step I.1 — Initialize Next.js project files
**Requirement:** Add the minimum scaffolding so `next build` succeeds; do NOT touch existing HTML yet.
**Files:**
- `package.json` (new)
- `tsconfig.json` (new)
- `next.config.mjs` (new)
- `next-env.d.ts` (new — Next.js generates on first build)
- `.eslintrc.json` (new)
- `app/layout.tsx` (new — minimal root layout, just `<html>`/`<body>`)
- `app/page.tsx` (new — temporary placeholder that DELEGATES to old static `index.html` via a redirect to keep prod working)

**Implementation:**
```json
// package.json
{
  "name": "kcprishtina038",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "types": "supabase gen types typescript --linked > lib/supabase/types.ts"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "next-intl": "^3.20.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```js
// next.config.mjs
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // During the migration, let Vercel still serve our old .html files.
  // Once cutover (Phase VII) is done, this rewrite block is deleted.
  async rewrites() {
    return { fallback: [] };
  },
  // Security headers — same content as vercel.json today.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
export default nextConfig;
```

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sq">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx — TEMPORARY during Phase I-IV; rewritten in Phase IV.1.
// Step I.2 moves all old .html into public/, so /index.html keeps serving.
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/index.html");
}
```

**Pre-step (Step I.0): move all current `.html` into `public/`**
Before running Step I.1, relocate every page so it stays reachable once Next.js is detected (Next.js only serves `app/` routes + `public/` files):
```bash
mkdir -p public/admin
git mv index.html about.html sections.html section-mtb.html events.html join.html \
       login.html reset-password.html member-portal.html member-profile.html \
       public/
git mv admin/*.html public/admin/
# admin/_shell.js + admin/admin.js + admin/styles.css stay under admin/ —
# they're still referenced by the moved HTML via relative paths (../assets/...)
# until Phase VII cleanup. But the HTML uses src="assets/..." absolute → public/.
# So we also need:
mkdir -p public/assets
git mv assets/app.js assets/supabase.js assets/styles.css public/assets/
# logo/og/photos move to public/assets/ as part of Step I.2.
```
This keeps every existing URL working: `/index.html`, `/about.html`, `/admin/dashboard.html`, etc. The clean URL `/about` (no extension) only starts working once `app/about/page.tsx` is built in Step IV.2.

**Verification:**
- [ ] `npm install` succeeds (creates `node_modules/`, `package-lock.json`).
- [ ] `npm run build` exits 0.
- [ ] `npm run dev` starts a server on `http://localhost:3000`.
- [ ] Visiting `http://localhost:3000/` redirects to `/index.html` and renders the old landing page.

**Risk:** None — old `.html` still served as static files from repo root by Vercel's static-file fallback, even with Next.js detected.
**Rollback:** Delete `package.json`, `tsconfig.json`, `next.config.mjs`, `app/`, `node_modules/`, `package-lock.json`. Vercel returns to static-only deploy.

#### Step I.2 — Move static assets to `public/`
**Requirement:** Next.js serves `public/` at the URL root. Our existing `assets/logo.jpg`, `assets/og-default.jpg`, `assets/photos/` must move there so URLs like `/assets/logo.jpg` keep working.

**Files:**
- `public/assets/logo.jpg` (moved from `assets/logo.jpg`)
- `public/assets/og-default.jpg` (moved from `assets/og-default.jpg`)
- `public/assets/photos/` (moved from `assets/photos/`)
- `public/robots.txt` (moved from `robots.txt`)
- `public/sitemap.xml` (moved from `sitemap.xml`)
- `public/og-image.jpg`, etc. — copies, no path change.

**Implementation:**
```bash
mkdir -p public/assets
git mv assets/logo.jpg public/assets/logo.jpg
git mv assets/og-default.jpg public/assets/og-default.jpg
git mv assets/photos public/assets/photos
git mv robots.txt public/robots.txt
git mv sitemap.xml public/sitemap.xml
# assets/styles.css, app.js, supabase.js stay where they are for now —
# the old .html files reference them by path and need them at /assets/...
# Phase VII deletes them.
```

**Verification:**
- [ ] `curl http://localhost:3000/assets/logo.jpg` returns 200, correct bytes.
- [ ] `curl http://localhost:3000/robots.txt` returns the file.
- [ ] Old `.html` pages still load with images/styles intact.

**Risk:** A path mismatch breaks images. Mitigation: assets/ at root is still served by Vercel's static-file fallback if a file isn't in `public/`, so during the transition both locations resolve. The actual move only matters once the old HTML is deleted.
**Rollback:** `git mv` back.

#### Step I.3 — Provision Vercel env vars + connect Supabase marketplace integration
**Requirement:** Move `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` out of `assets/supabase.js` and into Vercel env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

This is a Vercel Dashboard task (no code), preserved here as a manual step.

**Manual:**
1. Vercel Dashboard → Project → Settings → Environment Variables → Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://xutklvcsdgzmhxzexisb.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_cB3Hl2_07OqDyV-U5exvbQ_WiTjKx6M`
   - Scope: Production + Preview + Development.
2. Optionally install the Marketplace Supabase integration for auto-injection.
3. Trigger a redeploy.

**Verification:**
- [ ] In Vercel Dashboard → Project → Settings → Environment Variables, both vars are visible.
- [ ] A redeploy succeeds with no errors.

**Risk:** None — env vars don't affect the old `.html` site at this stage.

### Phase II — Supabase + auth foundation (3 h)

**Depends on:** Phase I.
**Output:** Server and browser Supabase clients work; `middleware.ts` protects `/admin` and `/portal`; `lib/supabase/types.ts` provides typed queries.

#### Step II.1 — Generate Supabase TypeScript types
**Files:**
- `lib/supabase/types.ts` (new — generated)

**Implementation:**
```bash
# Requires supabase CLI; we already have access token in .env
brew install supabase/tap/supabase
supabase login --token "$(grep ^SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)"
supabase link --project-ref xutklvcsdgzmhxzexisb
npm run types   # runs the script defined in package.json
```

**Verification:**
- [ ] `lib/supabase/types.ts` exists, contains `Database` type with `public.profiles`, `public.events`, etc.
- [ ] `tsc --noEmit` passes.

#### Step II.2 — Browser Supabase client (`lib/supabase/client.ts`)
**Files:**
- `lib/supabase/client.ts` (new)

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

#### Step II.3 — Server Supabase client (`lib/supabase/server.ts`)
**Files:**
- `lib/supabase/server.ts` (new)

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* called from a Server Component — ignore */ }
        },
      },
    }
  );
}
```

#### Step II.4 — `middleware.ts` for auth gating
**Files:**
- `middleware.ts` (new at repo root)

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/admin") || path.startsWith("/portal");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Admin routes require staff role.
  if (path.startsWith("/admin") && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    const allowed = profile && profile.status === "active" &&
      ["admin", "editor", "staff", "coach"].includes(profile.role);
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|png|svg|css|js)$).*)"],
};
```

**Verification:**
- [ ] Visiting `/admin/dashboard` while signed out → redirects to `/login?next=/admin/dashboard`.
- [ ] Signing in as `member` then visiting `/admin/dashboard` → redirects to `/portal`.
- [ ] Signing in as `admin` then visiting `/admin/dashboard` → reaches the route.

### Phase III — Component library + globals (2 h)

**Depends on:** Phase II.
**Output:** Shared chrome (nav, sidebar, modal, data-table) lives in `components/`; global CSS imported in root layout.

#### Step III.1 — Port global CSS
**Files:**
- `app/globals.css` (new — verbatim copy of current `assets/styles.css`, 847 lines)
- `app/admin/admin.css` (new — verbatim copy of `admin/styles.css`)
- `app/layout.tsx` (import `./globals.css`)

```tsx
// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KÇ Prishtina 038 — Klubi Çiklistik i Prishtinës",
  description: "Klubi çiklistik i Prishtinës. Gjashtë disiplina, një ekip.",
  metadataBase: new URL("https://prishtina038.cc"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sq">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..125,400..900&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

#### Step III.2 — `i18n` setup with `next-intl`
**Files:**
- `i18n.ts` (new)
- `messages/sq.json` (new — extracted from current `I18N.sq` in `assets/app.js`)
- `messages/en.json` (new — extracted from current `I18N.en`)
- `app/layout.tsx` (wrap with `NextIntlClientProvider`)

```ts
// i18n.ts
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("kc038_lang")?.value ?? "sq") as "sq" | "en";
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

Extraction (one-off — `assets/app.js` does NOT export `I18N`, so direct `require()` would fail):
```bash
mkdir -p messages
# Temporarily append export, run extraction, restore.
cp public/assets/app.js /tmp/app.js.bak
echo "module.exports = { I18N };" >> public/assets/app.js
node -e "
  const { I18N } = require('./public/assets/app.js');
  const fs = require('fs');
  fs.writeFileSync('messages/sq.json', JSON.stringify(I18N.sq, null, 2));
  fs.writeFileSync('messages/en.json', JSON.stringify(I18N.en, null, 2));
"
mv /tmp/app.js.bak public/assets/app.js
```

#### Step III.3 — `<PublicNav>` component
**Files:**
- `components/nav/PublicNav.tsx` (new)
- `components/nav/PublicNav.module.css` (new — optional; can also use globals.css classes)

Replaces the nav block currently duplicated across 6 HTML pages. Server component (no JS unless auth state needs hydrating).

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

export async function PublicNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const t = await getTranslations("nav");

  let signinLabel = t("signin");
  let signinHref: string = "/login";
  let isAuthed = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.status === "active") {
      isAuthed = true;
      if (profile.role === "member") {
        signinLabel = t("account"); signinHref = "/portal";
      } else {
        signinLabel = t("admin"); signinHref = "/admin/dashboard";
      }
    }
  }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <img src="/assets/logo.jpg" alt="KÇ Prishtina 038" />
          <div className="brand-text">
            <span className="kc">{t("brand.kc")}</span>
            <span className="sub">{t("brand.sub")}</span>
          </div>
        </Link>
        <div className="nav-links">
          <Link href="/about">{t("about")}</Link>
          <Link href="/sections">{t("sections")}</Link>
          <Link href="/events">{t("events")}</Link>
          <Link href="/join">{t("join")}</Link>
        </div>
        <div className="nav-right">
          <LangToggle />
          <Link href={signinHref} className={`nav-signin ${isAuthed ? "is-authed" : ""}`}>
            {signinLabel}
          </Link>
        </div>
      </div>
    </nav>
  );
}
```

#### Step III.4 — `<AdminSidebar>` + `<AdminLayout>` (replaces `admin/_shell.js`)
**Files:**
- `components/admin/AdminSidebar.tsx` (new — server component)
- `app/admin/layout.tsx` (new — wraps every admin route)

#### Step III.5 — `<DataTable>` (replaces 12 hand-rolled tables)
**Files:**
- `components/admin/DataTable.tsx` (new — client component)

Props: `columns`, `rows`, `loading`, `empty`. Used by every admin list page.

#### Step III.6 — `<Modal>` + `<Form>` (replaces `openModal()` in `admin/admin.js`)
**Files:**
- `components/ui/Modal.tsx`
- `components/ui/Form.tsx`
- `components/ui/Field.tsx` — typed wrapper around `<input>`/`<select>`/`<textarea>`

#### Step III.7 — `<Toast>` + toast context
**Files:**
- `components/ui/Toast.tsx`
- `lib/toast.ts` (context provider)

#### Step III.8 — `<LangToggle>` client component + `setLocale` server action
**Files:**
- `components/nav/LangToggle.tsx` (new — client component)
- `components/nav/locale-action.ts` (new — server action that writes the cookie)

Client components can't write cookies directly. The action sets the cookie server-side; `router.refresh()` re-runs the server tree with the new locale.

```ts
// components/nav/locale-action.ts
"use server";
import { cookies } from "next/headers";
export async function setLocale(locale: "sq" | "en") {
  (await cookies()).set("kc038_lang", locale, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
  });
}
```
```tsx
// components/nav/LangToggle.tsx
"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "./locale-action";

export function LangToggle({ current }: { current: "sq" | "en" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const switchTo = (l: "sq" | "en") => start(async () => {
    await setLocale(l);
    router.refresh();
  });
  return (
    <div className="lang-pill" role="group" aria-label="Language">
      {(["sq", "en"] as const).map(l => (
        <button key={l} onClick={() => switchTo(l)}
                className={l === current ? "active" : ""}
                disabled={pending}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}
```

**Verification (for Phase III):**
- [ ] Storybook-equivalent: visit `http://localhost:3000/test` (temporary debug route) to see each component rendered.
- [ ] Lighthouse scores on the test page: ≥ 95 Performance.
- [ ] TypeScript: `tsc --noEmit` clean.

### Phase IV — Port public marketing pages (4 h)

**Depends on:** Phase III.
**Output:** `/`, `/about`, `/sections`, `/sections/mtb`, `/events`, `/join` all served by Next.js. Old `.html` files kept on disk for safety but no longer the source of truth.

Pattern for each: server component fetches DB data (where applicable), renders the same HTML structure as the original. The temporary redirect in `app/page.tsx` (Step I.1) is replaced with the real page in Step IV.1.

#### Step IV.1 — `app/page.tsx` (landing)
**Files:**
- `app/page.tsx` (rewrite from redirect → full landing)
- `components/landing/HeroSection.tsx`
- `components/landing/StatsStrip.tsx`
- `components/landing/Countdown.tsx` (client component — has setInterval)
- `components/landing/DisciplinesGrid.tsx`
- `components/landing/ResultsTable.tsx`
- `components/landing/EventsList.tsx`
- `components/landing/NewsGrid.tsx`
- `components/landing/SponsorsBlock.tsx`
- `components/landing/JoinBand.tsx`
- `components/landing/Footer.tsx`

Each component receives data via props from the server-rendering parent.

#### Step IV.2 — `app/about/page.tsx`
#### Step IV.3 — `app/sections/page.tsx`
#### Step IV.4 — `app/sections/mtb/page.tsx` (renames from `section-mtb`)
#### Step IV.5 — `app/events/page.tsx`
#### Step IV.6 — `app/join/page.tsx` + `app/join/JoinForm.tsx` (client component)

**Verification (per page):**
- [ ] Visual diff against the deployed old page — pixel-identical.
- [ ] `view-source` shows real content (server-rendered, not empty `<div id="root">`).
- [ ] Lighthouse ≥ 95 on Performance and SEO.
- [ ] Both SQ and EN locales render correctly when cookie is flipped.

### Phase V — Auth + member portal (3 h)

**Depends on:** Phase III + IV.

#### Step V.1 — `app/login/page.tsx` + `app/login/LoginForm.tsx`
#### Step V.2 — `app/auth/reset-password/page.tsx`
#### Step V.3 — `app/auth/callback/route.ts` (handles Supabase magic-link/OAuth/recovery callback)

```ts
// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=callback-failed`);
}
```

Supabase email templates (password reset, magic link, OAuth) must redirect to `https://prishtina038.cc/auth/callback?next=/portal` — update in Supabase Dashboard → Authentication → URL Configuration after Phase VII cutover.
#### Step V.4 — `app/portal/layout.tsx` (member portal sidebar)
#### Step V.5 — `app/portal/page.tsx` (dashboard — fetched server-side: next race, dues, attendance)
#### Step V.6 — `app/portal/profile/page.tsx` + `ProfileForm.tsx` (client component for the editable form; metadata jsonb persistence intact)
#### Step V.7 — `app/portal/dues/page.tsx` (new — separates the "my dues" view that was a tile in the old portal)
#### Step V.8 — `app/portal/calendar/page.tsx` (new — separates the "my calendar")

### Phase VI — Admin pages (6 h)

**Depends on:** Phase III + V.

Each admin page = one server component that fetches the data, plus a client component for interactivity (modals, role pickers, file upload).

#### Step VI.1 — `app/admin/layout.tsx` (admin shell)
#### Step VI.2 — `app/admin/dashboard/page.tsx` (KPIs, next race, latest applications)
#### Step VI.3 — `app/admin/applications/page.tsx` + `ApplicationsList.tsx` (filter chips, approve/reject buttons via server action)
#### Step VI.4 — `app/admin/members/page.tsx` + `MembersList.tsx` (section filter, role badges, row link to detail)
#### Step VI.5 — `app/admin/members/[id]/page.tsx` + `MemberEditForm.tsx`
#### Step VI.6 — `app/admin/sections/page.tsx`
#### Step VI.7 — `app/admin/staff/page.tsx` + `StaffList.tsx` (role picker calls `set_user_role` RPC)
#### Step VI.8 — `app/admin/events/page.tsx` + `EventForm.tsx` (create/edit modal)
#### Step VI.9 — `app/admin/results/page.tsx` + `ResultForm.tsx`
#### Step VI.10 — `app/admin/news/page.tsx` + `NewsEditor.tsx`
#### Step VI.11 — `app/admin/media/page.tsx` + `MediaUploader.tsx` (Supabase Storage upload)
#### Step VI.12 — `app/admin/sponsors/page.tsx` + `SponsorForm.tsx`
#### Step VI.13 — `app/admin/settings/page.tsx` + `SettingsForm.tsx`

**Server Actions:**
Most CRUD goes through Next.js server actions (`"use server"`) rather than client-side Supabase calls. Benefits:
- RLS still enforces (server uses the same publishable key + user cookie).
- No client-side data leaks.
- Automatic revalidation of cached pages via `revalidatePath()`.

Example:
```ts
// app/admin/applications/actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveApplication(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_application", { app_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
}
```

### Phase VII — Cutover + cleanup (1.5 h)

**Depends on:** Phase IV–VI all done.
**Output:** Old HTML/JS/CSS removed; Next.js is the sole source of truth.

#### Step VII.1 — Delete old HTML files
**Files deleted:**
- `index.html`, `about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html`
- `login.html`, `reset-password.html`, `member-portal.html`, `member-profile.html`
- `admin/dashboard.html` through `admin/settings.html` (12 files)
- `admin/_shell.js`, `admin/admin.js`, `admin/styles.css`

#### Step VII.2 — Delete old shared assets
**Files deleted:**
- `assets/app.js`
- `assets/supabase.js`
- `assets/styles.css`

#### Step VII.3 — Delete `vercel.json`
Next.js's `next.config.mjs` now sets the headers. Vercel detects Next.js automatically.

#### Step VII.4 — Update `README.md`
Document the new structure, build command (`npm run build`), dev command (`npm run dev`).

#### Step VII.5 — Update `docs/RUNBOOK.md`
Add Next.js deploy notes, env var management, type generation.

#### Step VII.6 — Update `scripts/smoke.py`
URLs unchanged; just verify all routes still 200 + headers present + RLS probes unchanged.

#### Step VII.7 — Update `.gitignore`
Add: `.next/`, `*.tsbuildinfo`, `out/`.

### Phase VIII — Polish + safety net (1 h)

**Depends on:** Phase VII.

#### Step VIII.1 — Add `eslint`/`prettier` config + run once

#### Step VIII.2 — Add a basic `__tests__/` setup (Vitest or `node --test`) — at minimum, one test per server action

#### Step VIII.3 — Configure `next/image` for the logo + OG image (auto WebP, CDN-cached)

#### Step VIII.4 — Add `loading.tsx` + `error.tsx` shells per route segment

#### Step VIII.5 — Add a `not-found.tsx` page

## Dependency Graph

```
Phase I (Bootstrap)
   │
   ▼
Phase II (Supabase + Auth)
   │
   ▼
Phase III (Components) ───────┐
   │                          │
   ▼                          │
Phase IV (Public pages)       │
   │                          │
   ▼                          │
Phase V (Auth + Portal) ◄─────┤
   │                          │
   ▼                          │
Phase VI (Admin pages) ◄──────┘
   │
   ▼
Phase VII (Cutover)
   │
   ▼
Phase VIII (Polish)
```

Within each phase, steps are mostly independent (each is one page or one component).

## Parameters Added (env vars + config)

| Parameter | Type | Default | Config Location | Used By |
|-----------|------|---------|-----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL | (required) | Vercel env vars + local `.env.local` | `lib/supabase/{client,server}.ts`, `middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | string | (required) | Vercel env vars + local `.env.local` | same |

The pre-existing `.env` (gitignored) keeps `SUPABASE_ACCESS_TOKEN` for type generation; renamed to `.env.local` (Next.js convention).

## Files Modified (Summary)

| Category | Count | Notes |
|----------|-------|-------|
| New `app/` routes | 23 (pages) + 4 layouts + ~6 route handlers | Each maps to one current `.html` |
| New `components/` | ~25 | Nav, Sidebar, Modal, DataTable, Form, Field, Toast, page-section components |
| New `lib/` | 4 | `supabase/{client,server,types,middleware-helper}.ts`, `toast.ts`, `i18n.ts` |
| New `messages/` | 2 | `sq.json`, `en.json` extracted from current dict |
| New config files | 5 | `package.json`, `tsconfig.json`, `next.config.mjs`, `.eslintrc.json`, `middleware.ts` |
| Deleted in Phase VII | 25 | All current `.html` + 3 `assets/*.js,css` + 3 `admin/*.js,css` + `vercel.json` |
| Modified | 3 | `README.md`, `docs/RUNBOOK.md`, `scripts/smoke.py` |

## Migration safety: site stays live

The migration is structured as **build-alongside, swap-at-the-end**:

- During Phases I-VI, both the old `.html` files AND the new Next.js routes exist.
- Vercel detects Next.js once `package.json` is present (Phase I.1). It then serves: (a) Next.js routes for paths matched by `app/`, (b) static files from `public/` for everything else, (c) **NOT** old `.html` files at repo root (those become invisible).
- The Step I.1 `app/page.tsx` redirect to `/index.html` keeps the live site working until `app/page.tsx` is rewritten as the real landing in Step IV.1.

This means every commit during the migration leaves a working production site.

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | TypeScript strict mode | **YES** — `"strict": true` in `tsconfig.json` |
| 2 | i18n library | **`next-intl`** |
| 3 | Admin mutations | **Server actions** (`"use server"` functions) |
| 4 | Component library | **None** — port existing CSS as-is, add primitives only on demand |
| 5 | Translation keys | **Keep current `data-i18n.*` keys verbatim** — they migrate 1:1 to `messages/{sq,en}.json` |
| 6 | Local dev DB | **Hit production Supabase** — single-person workflow; `supabase start` later if a team forms |
| 7 | Image strategy | **`next/image` for logo + OG image** (every-page assets, free WebP+CDN); `public/assets/photos/` stays as plain `<img>` for v1 — full `next/image` migration deferred to Phase VIII |

These resolutions are baked into the phase steps above; no further blockers.

---

**Plan summary:**
- **8 phases, ~55 steps**
- **~20 hours implementer time**, spread across 5 days
- **Risk: MEDIUM** — large surface, but Supabase stays untouched and each phase produces a working deployable state
- **Site stays live throughout** — the migration is build-alongside, no big-bang
- **Ready for `/plan-review` after Open Questions 1-4 are resolved.** 5-7 don't block.
