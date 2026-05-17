# Plan: KÇ Prishtina 038 — Production Static Site on Vercel Hobby

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-05-17 |
| Author | Claude + Qëndrim |
| Status | READY FOR IMPLEMENTATION |
| Estimated effort | 4–6 hours (excluding waiting on real photography) |
| Files affected | 15 new / modified (6 HTML, 2 SEO files, 1 vercel.json, 1 .vercelignore, 1 .gitignore, 1 OG image, 1 photos README, 1 root README, 1 project/HANDOFF.md) |
| New parameters | 0 (no app config; static site) |
| Risk level | LOW |

## Goal

Ship a production-ready, bilingual (SQ/EN) static marketing site for KÇ Prishtina 038, deployable for free on Vercel Hobby. The design is already validated in the handoff bundle under `project/`; this plan strips the prototype-only authoring tools (drag-and-drop `<image-slot>` custom element, in-page tweaks/edit-mode panel, postMessage handshake with the design canvas), wires up real-image affordances, adds the minimum SEO/hosting plumbing Vercel expects, and leaves a clean repo a non-Claude developer can take over.

## Constraints

- **Vercel Hobby tier only** — no serverless functions, no edge middleware, no ISR/SSR, no cron, no team features. Static output only. (Hobby is non-commercial: KÇ Prishtina 038 is a registered non-profit, so this is the right fit; if commercial sponsors later demand a contract page, revisit.)
- **No build step required.** The site is hand-authored HTML+CSS+JS; Vercel must serve it as-is from the repo root. Build command: none. Output dir: `.` (repo root).
- **Preserve pixel-perfect design fidelity** with the prototype (`project/index.html` and siblings). Do not refactor visual structure.
- **Keep real features intact**: SQ/EN i18n switcher (`LangState` + `data-i18n` bindings), race countdown (`startCountdown`), scroll reveal (IntersectionObserver). Locale preference must persist via `localStorage` (`kc038_lang`).
- **Drop prototype-only code**: `image-slot.js`, the `tweaks()` IIFE, the `__activate_edit_mode` / `__edit_mode_available` postMessage handshake, and all `<image-slot>` elements.
- **No look-ahead bias on content**: don't fabricate sponsor logos, photos, or results we don't have. Keep the existing `.ph` placeholder pattern where real media is missing.
- **Albanian-first** — `<html lang="sq">` and `lang` cookie/localStorage default to `sq` (preserves the prototype's default).
- **Accessibility floor**: every `<img>` has `alt`, every `<button>` is keyboard-reachable, color contrast already verified by the design system (paper #F4F2EC on ink #0F1A2E ≈ 14.8:1, ember #C25A2D on paper ≈ 4.7:1).
- **No secrets, no env vars** — everything in the repo is public.

## Current State

The repo at `/Users/qendrimpllnaa/Documents/workspace/kcprishtina038` currently contains:

- `README.md` — handoff instructions from Claude Design.
- `project/` — original prototype bundle:
  - `index.html` (42 KB) — landing page, the only one using `<image-slot>` (3 occurrences in the hero collage at lines 320-322) and loading `assets/image-slot.js` (line 12).
  - `about.html`, `events.html`, `sections.html`, `section-mtb.html`, `join.html` — all production-clean (grep verified: 0 references to `image-slot`, `tweaks`, `edit_mode`, `EDITMODE`, `window.parent.postMessage`).
  - `assets/styles.css` (25 KB) — full design system; no surgery required.
  - `assets/app.js` (31 KB) — `I18N` dictionary (SQ+EN), `LangState` IIFE, `DOMContentLoaded` handler (i18n + scroll reveal), `startCountdown(targetIso, elPrefix)`, and a `tweaks()` IIFE from line 608 to EOF (line 692) which is prototype-only.
  - `assets/image-slot.js` (31 KB) — prototype-only drag-and-drop image filler with `window.omelette` sidecar writes; not deployable.
  - `assets/logo.jpg` (162 KB) — club logo; reuse as-is.
  - `uploads/brand_assets-1778965438000.jpg` — same logo, alternate path; not referenced from any HTML.
- **Already in place from a partial implementation in this same session** (Phase 0):
  - `index.html` at repo root — production-clean landing page (no `<image-slot>`, no tweaks panel). References `assets/styles.css`, `assets/app.js`, `assets/logo.jpg`.
  - `assets/styles.css` at repo root — verbatim copy of `project/assets/styles.css`.
  - `assets/app.js` at repo root — first 605 lines of `project/assets/app.js`, truncated to drop the `tweaks()` IIFE (lines 607-692). Contains: `I18N` dict, `LangState`, DOMContentLoaded handler, `startCountdown`.
  - `assets/logo.jpg` at repo root — copy of `project/assets/logo.jpg`.

No `package.json`, no `vercel.json`, no `.git`, no `docs/`. Site is unhosted.

## Phases

### Phase I — Lift remaining prototype pages to root (45 min)

**Depends on:** nothing (Phase 0 already done — `index.html` + assets are at root).
**Output:** A 6-page bilingual static site visible at the repo root with all internal links resolving.

#### Step I.1 — Copy `about.html` to repo root

**Requirement:** The landing page links to `about.html` and the footer links to `about.html#team` / `about.html#history`. Page must exist or links 404.
**Files:**
- `project/about.html` — source (read-only, do not modify).
- `about.html` (new, at repo root) — destination.

**Implementation:**
```bash
# Bash:
cp /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/project/about.html \
   /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/about.html
```

Page has no `image-slot` or tweaks panel (grep verified). It already references `assets/styles.css`, `assets/app.js`, `assets/logo.jpg` — paths resolve at the new location.

**Verification:**
- [ ] `diff project/about.html about.html` shows no difference.
- [ ] `grep -c "image-slot\|tweaks\|EDITMODE" about.html` returns `0`.
- [ ] Open `about.html` in a browser via `python3 -m http.server 8080` from repo root; nav, fonts, logo, SQ→EN switcher all work; no console errors.

**Risk:** None — pure copy.
**Rollback:** `rm about.html`.

#### Step I.2 — Copy `sections.html` to repo root

**Requirement:** Landing page disciplines grid links to `sections.html#road`, `#gravel`, `#track`, `#youth`, `#women`. The MTB card links to a separate page (`section-mtb.html`), but the other five must resolve.
**Files:**
- `project/sections.html` → `sections.html` (root).

**Implementation:**
```bash
cp /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/project/sections.html \
   /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/sections.html
```

**Verification:**
- [ ] `diff project/sections.html sections.html` empty.
- [ ] Anchor targets `#road`, `#gravel`, `#track`, `#youth`, `#women` exist as `id` attributes in the file: `grep -E 'id="(road|gravel|track|youth|women)"' sections.html` returns 5 matches.
- [ ] All asset paths resolve in browser.

**Risk:** Missing anchor IDs → smooth-scroll fails silently. Mitigation: verify above.
**Rollback:** `rm sections.html`.

#### Step I.3 — Copy `section-mtb.html` to repo root

**Requirement:** Landing page's MTB discipline card links to `section-mtb.html`. Footer disciplines list also points to it.
**Files:**
- `project/section-mtb.html` → `section-mtb.html` (root).

**Implementation:**
```bash
cp /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/project/section-mtb.html \
   /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/section-mtb.html
```

**Verification:**
- [ ] `diff project/section-mtb.html section-mtb.html` empty.
- [ ] Browser-open passes; `sec.mtb.*` i18n keys (defined in `assets/app.js` lines 207-227 SQ / 451-470 EN) render correctly when toggling languages.

**Risk:** None.
**Rollback:** `rm section-mtb.html`.

#### Step I.4 — Copy `events.html` to repo root

**Requirement:** Nav and CTA buttons across the site link to `events.html`. The landing-page countdown CTA points there. The events page itself uses `startCountdown(...)` (line 363 of source) — already wired against the same `assets/app.js`.
**Files:**
- `project/events.html` → `events.html` (root).

**Implementation:**
```bash
cp /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/project/events.html \
   /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/events.html
```

**Verification:**
- [ ] `diff project/events.html events.html` empty.
- [ ] `grep "startCountdown" events.html` shows the call exists.
- [ ] Countdown digits update once per second in the browser.

**Risk:** None.
**Rollback:** `rm events.html`.

#### Step I.5 — Copy `join.html` to repo root

**Requirement:** Hero "Bëhu pjesë e klubit" CTA and the join-band CTA both point to `join.html`. Page contains a contact form — must render but does not need a backend in this plan (see Step IV.2 for `mailto:` fallback decision).
**Files:**
- `project/join.html` → `join.html` (root).

**Implementation:**
```bash
cp /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/project/join.html \
   /Users/qendrimpllnaa/Documents/workspace/kcprishtina038/join.html
```

**Verification:**
- [ ] `diff project/join.html join.html` empty.
- [ ] Form fields render and accept input (no submit handler required at this step).
- [ ] No console errors.

**Risk:** Submit currently does nothing — addressed in Step IV.2.
**Rollback:** `rm join.html`.

### Phase II — Hosting plumbing for Vercel Hobby (45 min)

**Depends on:** Phase I. Step II.3 (git init + first commit) additionally depends on Phase V.1 (README rewrite) so the initial commit ships the project README rather than the design-handoff README.
**Output:** Repo is deployable to Vercel via the dashboard or `vercel` CLI; pretty URLs work; security headers applied.

#### Step II.1 — Add `vercel.json` for clean URLs and headers

**Requirement:** Vercel auto-detects static sites at the repo root, but we want (a) extensionless URLs (`/about` instead of `/about.html`), (b) security headers Vercel does NOT add by default, (c) cache headers for static assets.

**Files:**
- `vercel.json` (new) at repo root.

**Implementation:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

Notes on design choices:
- `cleanUrls: true` rewrites `/about.html` to `/about` (Vercel feature, free on Hobby). Internal links already use `.html` suffix — Vercel handles both; no link rewrite needed in HTML.
- `trailingSlash: false` keeps canonical URLs predictable for SEO.
- No CSP header — would need careful tuning for Google Fonts + inline `<style>` blocks. Defer.
- No redirects — site has no legacy paths.
- No `framework` field — Vercel auto-detects "Other" / static, which is correct.

**Verification:**
- [ ] `vercel.json` is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"` exits 0.
- [ ] After deploy, `curl -I https://<deployment>.vercel.app/about` returns `200` (not 308 redirect) and the security headers above.
- [ ] `curl -I https://<deployment>.vercel.app/assets/styles.css` shows `Cache-Control: public, max-age=31536000, immutable`.

**Risk:** Wrong `source` glob would skip some headers. Mitigation: `"/(.*)"` matches everything including `/`.
**Rollback:** `rm vercel.json` — site still deploys with Vercel defaults.

#### Step II.2 — Add `.gitignore`

**Requirement:** Initialize a sensible ignore list before `git init` so noise (Vercel CLI cache, macOS metadata, editor scratch) never reaches the repo.

**Files:**
- `.gitignore` (new) at repo root.

**Implementation:**
```
# macOS
.DS_Store

# Vercel
.vercel/

# Node (only if you ever add tooling later — currently none)
node_modules/

# Editor / IDE
.vscode/
.idea/
*.swp

# Local logs
*.log
```

**Verification:**
- [ ] File exists; `git status --ignored` (after Step II.3) shows the patterns honored.

**Risk:** None.
**Rollback:** `rm .gitignore`.

#### Step II.3 — Initialize git and commit

**Requirement:** Vercel deploys from a git remote (GitHub/GitLab/Bitbucket) on Hobby. Repo must be a git repo with at least one commit.

**Ordering note:** Step V.1 (README rewrite + `project/HANDOFF.md` creation) **must complete before this step** so the initial commit ships the correct project README, not the old design-handoff README. The dependency graph below reflects this. If V.1 is skipped, the first commit will look misleading in `git log` to anyone reviewing history later, but the site still works.

**Files:** All files at repo root, including the rewritten README from V.1.

**Implementation:**
```bash
cd /Users/qendrimpllnaa/Documents/workspace/kcprishtina038
git init -b main
git add .gitignore vercel.json index.html about.html sections.html section-mtb.html events.html join.html \
        assets/ docs/ README.md project/ robots.txt sitemap.xml .vercelignore
git commit -m "feat: production static site for KÇ Prishtina 038

Initial deployable site:
- 6 bilingual pages (SQ/EN) lifted from design handoff in project/
- Prototype-only image-slot.js and tweaks panel stripped
- Vercel Hobby config (clean URLs, security headers, asset cache)
- Design system in assets/styles.css, runtime in assets/app.js
- SEO: per-page meta + OG, robots.txt, sitemap.xml
- Preserves source bundle under project/ for reference

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

The user must confirm before any commit. The plan-implement protocol will surface this for explicit approval per the project's `feedback_no_destructive_git` memory.

**Verification:**
- [ ] `git log --oneline -1` shows the commit.
- [ ] `git status` is clean.
- [ ] `git ls-files | grep -E "^(index|about|sections|section-mtb|events|join)\.html$" | wc -l` returns `6`.
- [ ] `git show HEAD:README.md | head -5` shows the new project README (the "KÇ Prishtina 038 — official site" heading), confirming V.1 landed before this commit.

**Risk:** Accidentally committing secrets. Mitigation: there are none in this tree — verified by absence of `.env`, credentials files, or tokens (sandbox `denyOnly` would have blocked reads anyway). Risk of committing too early (before all phases done): the `git add` explicitly lists files so a missing phase's outputs are simply absent from the commit, not corrupting it.
**Rollback:** `rm -rf .git`.

#### Step II.4 — Push to GitHub and connect Vercel

**Requirement:** Vercel Hobby deploys via git integration. Public repo is fine (and free) for a club site.

**Files:** none (GitHub + Vercel dashboard work).

**Implementation:**
```bash
# Create the repo on GitHub (manual or via gh):
gh repo create kcprishtina038 --public --source=. --remote=origin --description="KÇ Prishtina 038 — Klubi Çiklistik. Static site."
git push -u origin main
```

Then in the Vercel dashboard:
1. New Project → Import Git Repository → select `kcprishtina038`.
2. Framework Preset: **Other** (Vercel detects static).
3. Build Command: leave empty.
4. Output Directory: leave empty (defaults to repo root).
5. Install Command: leave empty.
6. Deploy.

**Verification:**
- [ ] `https://kcprishtina038.vercel.app` (or whatever subdomain Vercel assigns) loads the landing page.
- [ ] All 6 routes work: `/`, `/about`, `/sections`, `/section-mtb`, `/events`, `/join`.
- [ ] Lighthouse desktop score ≥ 95 Performance, ≥ 95 Accessibility, ≥ 95 Best Practices, ≥ 90 SEO.
- [ ] No 404 in DevTools Network tab on any page.

**Risk:** Vercel sometimes treats `project/` as a buildable subfolder. Mitigation: framework set to "Other"; if it still trips, add `.vercelignore` with `project/` (currently we *want* `project/` deployable as a reference; revisit if it inflates build size — current total ≈ 400 KB so it's fine).
**Rollback:** Disconnect the project in Vercel; the GitHub repo remains.

### Phase III — SEO and discoverability (45 min)

**Depends on:** Phase I.
**Output:** Search engines and social previews work; sitemap exposes all routes.

#### Step III.1 — Expand `<head>` meta on every page

**Requirement:** The current pages have only `<title>` and basic `description` (index has none beyond title). Need Open Graph + Twitter Card + canonical for every public route.

**Files:**
- `index.html` lines 3-12 (the `<head>` opening) — extend.
- `about.html` lines 3-12 — extend.
- `sections.html` lines 3-12 — extend.
- `section-mtb.html` lines 3-12 — extend.
- `events.html` lines 3-12 — extend.
- `join.html` lines 3-12 — extend.

**Implementation:**

Replace the page's existing `<title>` (and, on `index.html` only, the existing `<meta name="description">` on line 7 of [index.html](index.html#L7)) with the block below. Substitute `{{PAGE_TITLE}}`, `{{PAGE_DESC}}`, `{{PAGE_PATH}}` per page (table below).

**Two source patterns to be aware of:**

- **`index.html` (the Phase 0 root file)** already has a `<meta name="description">` between `<title>` (line 6) and `<link rel="icon">` (line 8). Delete that existing description tag before inserting the new block — otherwise the page ends up with two `description` metas.
- **`about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html`** (lifted from `project/` in Phase I) have no description meta — just `<title>` immediately followed by `<link rel="icon">`. No deletion needed; just insert.

```html
<!-- Before (about/sections/section-mtb/events/join.html, lines 6-7 each): -->
<title>{{ existing per-page title }}</title>
<link rel="icon" href="assets/logo.jpg" />

<!-- Before (index.html, lines 6-8 — note extra description meta to DELETE): -->
<title>KÇ Prishtina 038 — Klubi Çiklistik</title>
<meta name="description" content="Klubi Çiklistik Prishtina 038 — gjashtë disiplina, një ekip. Garojmë nën rregullat e UCI dhe FÇK." />
<link rel="icon" href="assets/logo.jpg" />

<!-- After (all six pages): -->
<title>{{PAGE_TITLE}}</title>
<meta name="description" content="{{PAGE_DESC}}" />
<link rel="canonical" href="https://prishtina038.cc{{PAGE_PATH}}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="KÇ Prishtina 038" />
<meta property="og:title" content="{{PAGE_TITLE}}" />
<meta property="og:description" content="{{PAGE_DESC}}" />
<meta property="og:url" content="https://prishtina038.cc{{PAGE_PATH}}" />
<meta property="og:image" content="https://prishtina038.cc/assets/og-default.jpg" />
<meta property="og:locale" content="sq_AL" />
<meta property="og:locale:alternate" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{{PAGE_TITLE}}" />
<meta name="twitter:description" content="{{PAGE_DESC}}" />
<meta name="twitter:image" content="https://prishtina038.cc/assets/og-default.jpg" />
<meta name="theme-color" content="#0F1A2E" />
<link rel="icon" href="assets/logo.jpg" />
```

| Page | PAGE_TITLE | PAGE_DESC (≤155 chars) | PAGE_PATH |
|------|-----------|-------------------------|-----------|
| index | `KÇ Prishtina 038 — Klubi Çiklistik i Prishtinës` | `Klubi çiklistik i Prishtinës. Gjashtë disiplina, një ekip. Garojmë nën rregullat e UCI dhe FÇK — nga Germia te kalendari kontinental.` | `/` |
| about | `Klubi — KÇ Prishtina 038` | `Tre themelues, një ide e qartë: ta vendosim Prishtinën në hartën çiklistike të Ballkanit. Klub i FÇK, sipas rregullave të UCI dhe ECU.` | `/about` |
| sections | `Seksionet — KÇ Prishtina 038` | `Gjashtë disiplina aktive: Rrugë, MTB, Gravel, Trek, Akademia e të rinjve, Femra. Trajner i dedikuar dhe kalendar i veçantë për secilën.` | `/sections` |
| section-mtb | `MTB — Seksioni 02 · KÇ Prishtina 038` | `Cross-country mbi Germinë, Sharrin dhe Prokletijet. XCO dhe maratonë, trajner UCI Level 2, sezoni Prill–Tetor.` | `/section-mtb` |
| events | `Kalendari 2026 — Garat e KÇ Prishtina 038` | `Çdo garë dhe ride e sezonit 2026: Granfondo Sharri, Tour of Kosovo, Germi Open Ride, kampet verore.` | `/events` |
| join | `Bashkohu — Apliko si anëtar i KÇ Prishtina 038` | `Pranojmë çiklistë të të gjitha niveleve nga 9 vjeç e lart. Stërvitje me trajner, kalendar me gara, fanellë e klubit.` | `/join` |

Domain `prishtina038.cc` is what the prototype already uses in `mailto:` and `contact.address`. If the user does not own this domain, the plan-implement step must either (a) replace with the Vercel-assigned subdomain or (b) the user purchases and DNS-configures it. **Open question — see end.**

**Verification:**
- [ ] All six pages have exactly one `<link rel="canonical">` after edits: `grep -c "rel=\"canonical\"" *.html` → 6.
- [ ] All six pages have an `og:image`: `grep -c 'property="og:image"' *.html` → 6.
- [ ] Each page's canonical URL is unique: `grep -h 'rel="canonical"' *.html | sort -u | wc -l` → 6.
- [ ] Each page has **exactly one** `<meta name="description">` (catches the index.html dedup case): `for f in *.html; do echo -n "$f: "; grep -c 'name="description"' "$f"; done` — every line ends in `: 1`.
- [ ] Lighthouse SEO ≥ 95.
- [ ] Facebook Debugger and Twitter Card Validator both fetch a card with the OG image.

**Risk:** Mismatched canonical between dev and prod. Mitigation: use the chosen production domain end-to-end, not Vercel preview URLs.
**Rollback:** Revert each file via `git checkout HEAD~1 -- <file>` (this is why each step gets its own commit during implement).

#### Step III.2 — Create a default Open Graph image

**Requirement:** `og:image` must resolve to a real image (1200×630 recommended). The club logo alone is square and small — won't render well on Twitter/LinkedIn link previews.

**Files:**
- `assets/og-default.jpg` (new) — 1200×630 JPEG.

**Implementation:**

Two acceptable paths, decided by what the user has on hand:

**Option A — Designed OG card (preferred):** the user (or a designer) creates `assets/og-default.jpg` at 1200×630 with ink-on-paper composition: KÇ logo top-left, "KÇ PRISHTINA 038" in Bricolage Grotesque centered, "KLUBI ÇIKLISTIK · PRISHTINË" mono subtitle below, ember accent stripe along the bottom edge. This is a one-time deliverable from the design owner.

**Option B — Stopgap (use existing logo on dark backdrop):** generate a 1200×630 image with `ffmpeg` (or any image tool) — black background, logo centered. Acceptable for week-one launch; replace when (A) is ready.

```bash
# Option B stopgap with ImageMagick:
magick -size 1200x630 xc:'#0F1A2E' \
  \( assets/logo.jpg -resize 320x320 \) -gravity center -composite \
  assets/og-default.jpg
```

**Verification:**
- [ ] `assets/og-default.jpg` exists, is exactly 1200×630: `magick identify assets/og-default.jpg` (or `sips -g pixelWidth -g pixelHeight assets/og-default.jpg` on macOS).
- [ ] File size < 300 KB.
- [ ] Facebook Sharing Debugger renders the image without "image too small" warning.

**Risk:** Logo on dark works visually but is generic. Mitigation: Option A planned as a follow-up.
**Rollback:** `rm assets/og-default.jpg` (sites with broken `og:image` URLs still render, just without a preview thumb).

#### Step III.3 — Add `robots.txt`

**Requirement:** Make crawler intent explicit; point to sitemap.

**Files:**
- `robots.txt` (new) at repo root.

**Implementation:**
```
User-agent: *
Allow: /

Sitemap: https://prishtina038.cc/sitemap.xml
```

**Verification:**
- [ ] `curl https://<deployment>/robots.txt` returns the file with `Content-Type: text/plain`.
- [ ] Google Search Console "robots.txt Tester" reports no errors.

**Risk:** Wrong domain in the sitemap URL. Mitigation: use final production domain.
**Rollback:** `rm robots.txt`.

#### Step III.4 — Add `sitemap.xml`

**Requirement:** Expose all six routes to crawlers with `lastmod` for freshness signals.

**Files:**
- `sitemap.xml` (new) at repo root.

**Implementation:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://prishtina038.cc/</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://prishtina038.cc/about</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://prishtina038.cc/sections</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://prishtina038.cc/section-mtb</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://prishtina038.cc/events</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://prishtina038.cc/join</loc>
    <lastmod>2026-05-17</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

**Verification:**
- [ ] `xmllint --noout sitemap.xml` exits 0.
- [ ] `grep -c "<url>" sitemap.xml` → 6.
- [ ] Google Search Console accepts the sitemap.

**Risk:** Sitemap drifts from real routes. Mitigation: documented in Phase IV README as "regenerate sitemap when adding/removing pages."
**Rollback:** `rm sitemap.xml`.

### Phase IV — Image strategy and form submission (1 hour)

**Depends on:** Phase I.
**Output:** Real photos can be dropped in without code changes; the join form does not silently swallow submissions.

#### Step IV.1 — Stand up `assets/photos/` and define naming convention

**Requirement:** The design currently uses styled `.ph` div placeholders. We need a folder where the user (or a hired photographer) drops JPEG/WebP files with a predictable naming scheme, and a one-paragraph guideline so the design's aspect ratios are respected.

**Files:**
- `assets/photos/` (new directory, empty).
- `assets/photos/README.md` (new) — naming convention + aspect ratios + how to swap a placeholder for a real photo.

**Implementation:**

Create the directory and a `README.md` inside it:

```markdown
# Photos

Drop real photography here. The site does NOT auto-load anything — each
photo is referenced explicitly by an HTML file via an `<img src>` or a
CSS `background-image`.

## Naming convention

`<page>-<slot>.<ext>` — lowercase, hyphens, no spaces.

Examples:
- `hero-team.jpg`            → landing hero collage (large slot)
- `hero-portrait.jpg`        → landing hero collage (top-right slot)
- `hero-training.jpg`        → landing hero collage (bottom-right slot)
- `founder-qendrim.jpg`      → about / founders trio
- `founder-albion.jpg`
- `founder-shqiponja.jpg`
- `rider-<lastname>.jpg`     → roster grid
- `news-<slug>.jpg`          → news cards
- `event-granfondo-2026.jpg` → events page hero / cards

## Aspect ratios

| Slot | Ratio | Recommended px (long edge) |
|------|-------|----------------------------|
| Hero collage large (`.s1`) | ~3:4 portrait inside a 1.2fr×2-row cell | 1600 |
| Hero collage small (`.s2`, `.s3`) | ~1:1 to 4:3 | 1200 |
| Founder / portrait | 4:5 | 1200 |
| Roster rider | 3:4 | 1200 |
| News card | 4:3 | 1200 |
| Event hero | 16:9 | 1920 |

## Format

JPEG q=82-85 for photos; WebP if you can supply both (the site will be
updated to use `<picture>` in a follow-up). PNG only for logos with
transparency.

## Swapping a placeholder for a real photo

Find the `<div class="ph">…</div>` (or, on the landing page, the
`<div class="slot s1">…</div>`) and replace its inner content with:

`<img src="assets/photos/hero-team.jpg" alt="<descriptive alt>" loading="lazy" />`

The styled placeholder will disappear (the `<img>` covers it). Keep
`loading="lazy"` on everything below the fold; remove it only from the
landing hero's `.s1` (above the fold).
```

**Verification:**
- [ ] `ls assets/photos/README.md` exists.
- [ ] The README references aspect ratios that match the CSS rules in `assets/styles.css` (rider `.ph { aspect-ratio: 3/4 }` line 484, news `.ph { aspect-ratio: 4/3 }` line 545, etc.) — cross-check during review.

**Risk:** Convention drifts. Mitigation: README in the same folder makes it discoverable.
**Rollback:** `rm -rf assets/photos/`.

#### Step IV.2 — Wire the join form to a real submission target

**Requirement:** `join.html` from the prototype has **no `<form>` element** — just loose `<input>`/`<select>`/`<textarea>` fields in a `<div class="form-card">`, no `name` attributes anywhere, and a fake `<button type="button" onclick="alert('… (demo).')">` that flashes a success alert without sending anything. This is unshippable. Three changes:

1. Wrap the existing fields in a real `<form>` element with `action` + `method`.
2. Add `name` attributes to every field (mail and Formspree both need them; an unnamed `<input>` is invisible to form serialization).
3. Replace the fake alert button with a real submit.

**Files:**
- `join.html` lines 250-310 — the `form-card` block (opens at line 250 with `<div class="form-card">`, closes at line 310 with `</div>`). The cleanest surgery is to **replace the inner wrapper** (`<div style="margin-top: 32px;">` on line 254, and its closing `</div>` on line 309) with `<form ...>` / `</form>` — same visual structure, but now a real submittable form. The inner wrapper's content (the four `.form-row` blocks plus the submit-button row) becomes the form's content unchanged except for the field-level edits described below. After Phase I.5 the file is at the repo root with content identical to `project/join.html`; line numbers refer to that file.

**Reference — current state at [project/join.html:250-311](project/join.html#L250):**

```html
<div class="form-card">
  <div class="eyebrow"><span>Formulari i aplikimit</span></div>
  <h3 ...>...</h3>

  <div class="form-row">
    <div class="field">
      <label data-i18n="jp.form.name">Emri dhe mbiemri</label>
      <input type="text" placeholder="P.sh. Albion Ymeri" />
    </div>
    <div class="field">
      <label data-i18n="jp.form.age">Mosha</label>
      <input type="number" placeholder="P.sh. 28" min="9" max="80" />
    </div>
  </div>
  <div class="form-row">
    <div class="field">
      <label data-i18n="jp.form.email">Email</label>
      <input type="email" placeholder="ti@email.com" />
    </div>
    <div class="field">
      <label data-i18n="jp.form.phone">Telefon</label>
      <input type="tel" placeholder="+383 4_ ___ ___" />
    </div>
  </div>
  <div class="form-row">
    <div class="field">
      <label data-i18n="jp.form.section">Seksioni i preferuar</label>
      <select>
        <option>...</option>
        ...
      </select>
    </div>
    <div class="field">
      <label data-i18n="jp.form.exp">Përvojë çiklistike</label>
      <select>
        ...
      </select>
    </div>
  </div>
  <div class="field">
    <label data-i18n="jp.form.notes">Shënime shtesë</label>
    <textarea rows="4" placeholder="..."></textarea>
  </div>
  <div ...>
    <button class="btn btn-ember" type="button" onclick="alert('Faleminderit! Aplikimi është dërguar (demo).')">
      <span data-i18n="jp.form.submit">Dërgo aplikimin</span>
      ...
    </button>
  </div>
</div>
```

**Implementation — two options, user picks one. Both share the structural surgery (form wrapper + names + real submit button); only the `action`/`method` differ.**

**Common surgery (applies to both options):**

Replace the inner wrapper `<div style="margin-top: 32px;">` (line 254) and its closing `</div>` (line 309) with `<form>` / `</form>`. The form-card structure stays identical visually; the inner wrapper just changes tag.

```html
<!-- Before (project/join.html:250-310): -->
<div class="form-card">
  <div class="eyebrow"><span>Formulari i aplikimit</span></div>
  <h2 class="display display-s" style="margin-top: 12px;">Plotëso, dhe ne të kontaktojmë.</h2>

  <div style="margin-top: 32px;">                          <!-- line 254 -->
    <!-- four .form-row blocks + submit-button row -->
  </div>                                                    <!-- line 309 -->
</div>                                                      <!-- line 310 -->

<!-- After: -->
<div class="form-card">
  <div class="eyebrow"><span>Formulari i aplikimit</span></div>
  <h2 class="display display-s" style="margin-top: 12px;">Plotëso, dhe ne të kontaktojmë.</h2>

  <form action="{{ACTION}}" method="{{METHOD}}" {{EXTRA}} style="margin-top: 32px;">
    <!-- four .form-row blocks (with name= added per table below) + submit-button row -->
  </form>
</div>
```

For each `<input>`, `<select>`, `<textarea>`, add a `name` attribute. Also tag each user-visible required field with `required` and add `id`/`for` pairs for accessibility:

| Field | Add `name=` | Add `required`? |
|-------|-------------|-----------------|
| Emri dhe mbiemri | `name="name"` | yes |
| Mosha | `name="age"` | yes |
| Email | `name="email"` | yes |
| Telefon | `name="phone"` | no (keep optional) |
| Seksioni i preferuar | `name="section"` | yes |
| Përvojë çiklistike | `name="experience"` | yes |
| Shënime shtesë | `name="notes"` | no |

Each `<select>` also needs explicit `<option value="…">` attributes — current options have visible text only. Use slugified values: `road`, `mtb`, `gravel`, `track`, `youth`, `women` for section; `beginner`, `intermediate`, `advanced` for experience.

Replace the submit button:

```html
<!-- Before: -->
<button class="btn btn-ember" type="button" onclick="alert('Faleminderit! Aplikimi është dërguar (demo).')">
  <span data-i18n="jp.form.submit">Dërgo aplikimin</span>
  <svg class="arrow" ...></svg>
</button>

<!-- After: -->
<button class="btn btn-ember" type="submit">
  <span data-i18n="jp.form.submit">Dërgo aplikimin</span>
  <svg class="arrow" ...></svg>
</button>
```

Drop the `onclick` entirely. The form's native submission handles the rest.

**Option A — `mailto:` (zero-backend, mediocre UX):**

```html
<form action="mailto:info@prishtina038.cc" method="POST" enctype="text/plain">
```

Caveats: opens the user's default mail client with a pre-filled draft. Doesn't work on devices with no mail client configured. Field values land in the body as `key=value` pairs separated by newlines (that's what `enctype="text/plain"` produces — readable but not pretty).

**Option B — Formspree (recommended, professional UX):**

```html
<form action="https://formspree.io/f/{your-form-id}" method="POST">
```

Plus one honeypot input inside the form (above the submit button) to deter bots:

```html
<input type="text" name="_gotcha" tabindex="-1" autocomplete="off"
       style="position:absolute;left:-9999px;width:1px;height:1px;" />
```

Free Formspree tier: 50 submissions/month, custom thank-you redirect, spam filtering, inbox digest. The user must:
1. Sign up at formspree.io.
2. Create a form, copy the form ID (looks like `xyzeqobr`).
3. Verify the receiving email (one click).

**Recommendation:** Option B. The mailto fallback is fine for week-one if Formspree signup hasn't happened yet, but ship B as soon as possible.

**Verification:**
- [ ] `grep -c "<form " join.html` returns `1`.
- [ ] Every form control has a `name`: `grep -E "<(input|select|textarea)\\b" join.html | grep -vc 'name='` returns `0` (zero unnamed fields). Exception: the honeypot `_gotcha` field counts as named.
- [ ] No `onclick="alert"` remains: `grep -c "onclick=\"alert" join.html` returns `0`.
- [ ] Submit button is `type="submit"`: `grep -c 'type="submit"' join.html` returns `1`.
- [ ] In browser: submit with empty required fields → browser-native validation blocks submit and focuses the first missing field.
- [ ] In browser: submit a complete form on production → email arrives at the configured destination with all field values present and labelled.
- [ ] No CORS errors in DevTools Network tab on submit.

**Risk:** Without `name` attributes the form submits empty — silent data loss. The verification grep above is the canary. Spam: Formspree's honeypot covers most bots; if abuse appears, enable reCAPTCHA in Formspree settings (free).
**Rollback:** `git revert` the join.html commit. The site falls back to the prototype's demo-alert behavior, which is functionally broken but visually identical.

#### Step IV.3 — Smoke-test all internal navigation

**Requirement:** Ensure no link rots after the page lift.

**Files:** none modified — this is a verification step.

**Implementation:**
```bash
# Quick crawl from repo root (Python 3 one-liner; serves locally, then linkchecker hits every internal href):
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
# Use any link checker — example with `lychee` (cargo install lychee):
lychee --offline --exclude-mail . || true
# Or use `wget --spider --recursive`:
wget --spider --recursive --no-directories --quiet \
     --domains=localhost --reject-regex="^https?://" \
     http://localhost:8000/ 2>&1 | grep -E "broken|404" || echo "OK: no broken internal links"
kill $SERVER_PID
```

**Verification:**
- [ ] Crawler reports zero broken internal links.
- [ ] Manually click every nav item and footer link in a browser — all resolve.

**Risk:** False negatives if the crawler skips anchor URLs. Mitigation: spot-check the `#road`, `#team`, etc., anchors manually.
**Rollback:** N/A (verification step).

### Phase V — Repo hygiene (15 min)

**Depends on:** Phase I (needs the lifted HTML files for context in the README structure block). Step V.1 must complete **before** Step II.3 so the initial commit ships the project README, not the design-handoff README. Step V.2 (`.vercelignore`) must complete before Step II.3 so it lands in the initial commit.
**Output:** A non-Claude developer can clone the repo and understand it.

#### Step V.1 — Rewrite root `README.md`

**Requirement:** Current README is the design-handoff instructions from Claude Design, which is no longer the primary purpose. Make the root README the project README; move the handoff note inside `project/`.

**Files:**
- `README.md` (root, existing — rewrite).
- `project/HANDOFF.md` (new, optional) — preserve the original handoff text.

**Implementation:**

Move the current README content into `project/HANDOFF.md`, then write a fresh root README:

```markdown
# KÇ Prishtina 038 — official site

Static marketing site for the KÇ Prishtina 038 cycling club.
Hosted on Vercel Hobby. No build step.

## Structure

```
.
├── index.html             # Landing
├── about.html             # Club + founders
├── sections.html          # Six disciplines overview
├── section-mtb.html       # MTB section detail
├── events.html            # Race calendar
├── join.html              # Membership application
├── robots.txt
├── sitemap.xml
├── vercel.json            # Clean URLs + headers + cache
├── assets/
│   ├── styles.css         # Design system
│   ├── app.js             # i18n (SQ/EN), countdown, scroll reveal
│   ├── logo.jpg
│   ├── og-default.jpg     # 1200x630 social preview
│   └── photos/            # Real photography (see photos/README.md)
├── docs/
│   └── plan/              # Implementation plans
└── project/               # Original design handoff (read-only reference)
```

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No bundler, no transpiler, no dependencies. Edit HTML/CSS/JS directly.

## Deployment

- Push to `main` → Vercel auto-deploys.
- PRs get preview URLs.
- Production domain: `prishtina038.cc` (configured in Vercel dashboard).

## Editing the bilingual copy

All translated strings live in `assets/app.js` inside the `I18N` object
(top of file). Element bindings use `data-i18n="<key>"` in HTML. To add
a string: add the key to both `sq` and `en` blocks, then add
`data-i18n="<key>"` to the element.

## Updating images

See `assets/photos/README.md` for naming conventions and aspect ratios.
```

**Verification:**
- [ ] `README.md` exists at root with the new content.
- [ ] `project/HANDOFF.md` exists with the original handoff text (preserves provenance).
- [ ] No content lost: `wc -l project/HANDOFF.md` ≥ original line count.

**Risk:** None.
**Rollback:** `git checkout HEAD~1 -- README.md project/HANDOFF.md`.

#### Step V.2 — Optional: prune `project/` from production deploy

**Requirement:** `project/` is ~250 KB of reference material that shouldn't ship to users. Vercel will deploy it as static files (`/project/index.html` etc. become live URLs). Decide whether to keep or hide.

**Files:**
- `.vercelignore` (new, optional) at repo root.

**Implementation (if hiding):**
```
project/
docs/
```

Trade-off: hiding `project/` keeps `<deployment>/project/index.html` from being a live URL (which would be confusing — two landings). Hiding `docs/` keeps internal plans off the public site. Recommended: hide both.

**Verification:**
- [ ] After deploy, `curl -I https://<deployment>/project/index.html` returns 404.
- [ ] After deploy, `curl -I https://<deployment>/docs/plan/PLAN_KCP038_SITE.md` returns 404.
- [ ] All canonical site routes still 200.

**Risk:** Hiding `docs/` from deploy doesn't hide it from git — still public on GitHub. That's fine for plans, would not be fine for secrets (which there are none of).
**Rollback:** `rm .vercelignore`.

## Dependency Graph

```
Phase 0 (already done)
       │
       ▼
Step I.1 (about)         ─┐
Step I.2 (sections)      ─┤
Step I.3 (section-mtb)   ─┼─► Phase I complete
Step I.4 (events)        ─┤        │
Step I.5 (join)          ─┘        │
                                    │
       ┌────────────────────────────┼─────────────────────────────┐
       │                            │                             │
       ▼                            ▼                             ▼
Step III.1 (meta on 6 pages)   Step IV.1 (photos/ + README)   Step V.1 (README rewrite)
Step III.2 (og-default.jpg)    Step IV.2 (join form wiring)   Step V.2 (.vercelignore)
Step III.3 (robots.txt)        Step IV.3 (link smoke test)         │
Step III.4 (sitemap.xml)                                            │
       │                            │                              │
       └──────────┬─────────────────┴──────────────────────────────┘
                  │
                  ▼
            Step II.1 (vercel.json)
                  │
                  ▼
            Step II.2 (.gitignore)
                  │
                  ▼
            Step II.3 (git init + first commit)   ◄── needs V.1, V.2, III.*, IV.* done
                  │
                  ▼
            Step II.4 (push + Vercel connect)
```

**Reading the graph:**
- Phase I must finish first (the rest of the work is HTML-resident).
- Phases III, IV, V then run in parallel — each is independent of the others.
- Phase II.1 and II.2 (config-file authoring) can also run in parallel with III/IV/V.
- Phase II.3 (the first commit) is the merge point — it consumes outputs from all earlier phases so the initial commit ships a fully-shaped repo.
- Phase II.4 (Vercel connect) is last because it deploys whatever II.3 committed.

## Parameters Added

| Parameter | Type | Default | Config Location | Used By |
|-----------|------|---------|-----------------|---------|
| _(none — pure static site, no runtime parameters)_ | | | | |

This site has no presets, no env vars, no feature flags. The closest things to "parameters" are:

| Locale default | string | `"sq"` | `assets/app.js` `LangState` line 510 — `localStorage.getItem("kc038_lang") \|\| "sq"` | Initial render on first visit |
| Race countdown target | ISO string | `"2026-05-17T09:00:00"` | `index.html` + `events.html` inline `<script>` call to `startCountdown(...)` | Race countdown digits |
| Production domain | URL | `https://prishtina038.cc` | Canonical/OG meta tags, `robots.txt`, `sitemap.xml` | SEO |

## Files Modified (Summary)

| File | Steps | Type of Change |
|------|-------|----------------|
| `about.html` | I.1, III.1 | Copy from `project/`; extend `<head>` meta |
| `sections.html` | I.2, III.1 | Copy from `project/`; extend `<head>` meta |
| `section-mtb.html` | I.3, III.1 | Copy from `project/`; extend `<head>` meta |
| `events.html` | I.4, III.1 | Copy from `project/`; extend `<head>` meta |
| `join.html` | I.5, III.1, IV.2 | Copy from `project/`; extend `<head>` meta; set form `action` |
| `index.html` | III.1 | Extend `<head>` meta (already exists from Phase 0) |
| `vercel.json` | II.1 | New |
| `.gitignore` | II.2 | New |
| `robots.txt` | III.3 | New |
| `sitemap.xml` | III.4 | New |
| `assets/og-default.jpg` | III.2 | New |
| `assets/photos/README.md` | IV.1 | New |
| `README.md` | V.1 | Rewrite |
| `project/HANDOFF.md` | V.1 | New (move old README content) |
| `.vercelignore` | V.2 | New (optional) |

## Open Questions

1. **Domain.** Does the user own `prishtina038.cc`? If yes, point its DNS at Vercel during Step II.4. If no, three choices:
   - Buy it (≈ €15/yr for `.cc`, available from any registrar).
   - Use a different domain the user already owns.
   - Ship on the free `*.vercel.app` subdomain and update canonical/OG/sitemap URLs to match.

   This must be resolved before Step III.1 (meta tags need the final domain) and Step II.4 (Vercel DNS step). **Recommend: buy `prishtina038.cc` — it's already referenced in the prototype's contact info, so the prototype's author clearly intended it.**

2. **Open Graph image.** Will the user supply a designed `og-default.jpg` (Step III.2 Option A), or proceed with the stopgap logo-on-dark generation (Option B)? Either works for launch.

3. **Join-form backend.** `mailto:` (Step IV.2 Option A — zero setup, mediocre UX) or Formspree free tier (Option B — recommended, 5-minute setup)? If Formspree, the user must create the form and supply the endpoint ID.

4. **Should `project/` ship to production?** Step V.2 recommends hiding it via `.vercelignore` to avoid having a second, prototype version of the site at `/project/index.html`. Confirm.

5. **GitHub repo visibility.** Public (free, simpler) or private (requires Hobby's "personal" private-repo allowance — also free)? Public recommended; nothing sensitive in this tree.

6. **Future commercial use.** Vercel Hobby is non-commercial. A non-profit cycling club is fine, but if the club sells jerseys/memberships *with payment processing on the site*, Vercel considers that commercial and you'd need Pro ($20/mo). The current site has no checkout — it links to a future shop, no transactions. Flag if scope creeps.

---

**Plan summary:**
- **5 phases, 17 atomic steps** (5 page lifts + 4 hosting + 4 SEO + 3 image/form + 2 hygiene)
- **Estimated effort:** 4–6 hours of implementation, plus async time on domain DNS propagation and any custom photography
- **Key risks:** all LOW — no business logic, no data migrations, no state. The biggest landmine is committing the wrong production domain in canonical/OG tags before the DNS is settled.
- **Ready for `/plan-implement` after resolving Open Questions 1–4.**
