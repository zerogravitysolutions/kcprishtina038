# Implementation Log — KÇ Prishtina 038 Production Static Site

## Source Document

[docs/plan/PLAN_KCP038_SITE.md](PLAN_KCP038_SITE.md)

## Status

Phase: II | Step: II.4 (user-action handoff) | Status: AWAITING USER
Last verified: 2026-05-17

All steps implementable by Claude are DONE. Initial commit: `ce7153a`. Step II.4 (Vercel connect) requires the user to do:

1. Create a GitHub repo and push:
   ```bash
   # Option A — via gh (not installed on this machine):
   gh repo create kcprishtina038 --public --source=. --remote=origin
   git push -u origin main

   # Option B — manually:
   # 1. Create empty public repo "kcprishtina038" at github.com/new
   # 2. git remote add origin https://github.com/<user>/kcprishtina038.git
   # 3. git push -u origin main
   ```
2. In Vercel dashboard (vercel.com/new):
   - Import the `kcprishtina038` GitHub repo.
   - Framework Preset: **Other** (Vercel auto-detects static).
   - Build / Output / Install commands: **leave empty**.
   - Deploy.
3. After first deploy succeeds:
   - Verify all 6 routes work at `https://<assigned>.vercel.app/{,/about,/sections,/section-mtb,/events,/join}`.
   - DevTools Network tab: no 404s.
4. Configure custom domain `prishtina038.cc` in Vercel → Project Settings → Domains. Vercel will provide DNS records to add at the registrar.
5. Once DNS resolves, verify:
   - `curl -I https://prishtina038.cc/about` returns 200 (not 308).
   - `curl -I https://prishtina038.cc/assets/styles.css` shows `Cache-Control: public, max-age=31536000, immutable`.
   - Lighthouse: ≥95 Performance / ≥95 Accessibility / ≥95 Best Practices / ≥90 SEO on desktop.

## Locked-in Decisions (from Open Questions)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Production domain | `prishtina038.cc` | Already referenced in prototype's contact info; user is expected to own / acquire it. DNS configuration deferred to user. |
| 2 | OG image | Stopgap — Python+Pillow generates 1200×630 with logo centered on ink background. | ImageMagick not installed; Pillow is available. Replace with a designed card later. |
| 3 | Join-form backend | `mailto:info@prishtina038.cc` | Zero-setup. TODO logged to upgrade to Formspree free tier when user creates an account. |
| 4 | Hide `project/` + `docs/` from prod | Yes via `.vercelignore` | Avoids `/project/index.html` becoming a public duplicate landing; keeps internal plans off the public site. |

## Deviations from Plan

| Deviation | Plan says | Doing instead | Why |
|-----------|-----------|---------------|-----|
| Single initial commit | "Commit after EACH step" (protocol) vs Step II.3 (plan) — conflict | Single commit at II.3 per the plan's design | Fresh repo; per-step commits would produce 17 messy commits across a one-day initial deploy. Implementation log captures per-step granularity. |
| Step II.4 (Vercel connect) | "gh repo create + Vercel dashboard work" | Best-effort: I'll do everything that's automatable (git remote setup if `gh` is auth'd); the Vercel dashboard click-through is user-only. | `gh` not installed on this machine (verified `command -v gh` empty). User runs the GitHub + Vercel steps manually. |

## Version History

| Step | Date | Status | Plan Ref | Commit | Summary |
|------|------|--------|----------|--------|---------|
| I.1 | 2026-05-17 | DONE | §Phase I.1 | ce7153a | Copied `project/about.html` → `about.html` (17636 B, byte-identical) |
| I.2 | 2026-05-17 | DONE | §Phase I.2 | ce7153a | Copied `project/sections.html` → `sections.html` (16114 B); 5 anchor IDs verified |
| I.3 | 2026-05-17 | DONE | §Phase I.3 | ce7153a | Copied `project/section-mtb.html` → `section-mtb.html` (23992 B) |
| I.4 | 2026-05-17 | DONE | §Phase I.4 | ce7153a | Copied `project/events.html` → `events.html` (17640 B); `startCountdown` call confirmed |
| I.5 | 2026-05-17 | DONE | §Phase I.5 | ce7153a | Copied `project/join.html` → `join.html` (20267 B) |
| II.1 | 2026-05-17 | DONE | §Phase II.1 | ce7153a | `vercel.json` — cleanUrls, security headers, asset cache |
| II.2 | 2026-05-17 | DONE | §Phase II.2 | ce7153a | `.gitignore` — macOS, vercel, node, editor caches |
| III.1 | 2026-05-17 | DONE | §Phase III.1 | ce7153a | Per-page canonical + OG + Twitter meta on all 6 pages |
| III.2 | 2026-05-17 | DONE | §Phase III.2 | ce7153a | `assets/og-default.jpg` — 1200×630, 43 KB, Pillow-generated stopgap |
| III.3 | 2026-05-17 | DONE | §Phase III.3 | ce7153a | `robots.txt` |
| III.4 | 2026-05-17 | DONE | §Phase III.4 | ce7153a | `sitemap.xml` — 6 entries, valid XML |
| IV.1 | 2026-05-17 | DONE | §Phase IV.1 | ce7153a | `assets/photos/` directory + naming-convention README |
| IV.2 | 2026-05-17 | DONE | §Phase IV.2 | ce7153a | Join form wired to `mailto:`; 7 named fields, 5 required, honeypot, slugified options |
| IV.3 | 2026-05-17 | DONE | §Phase IV.3 | ce7153a | Local link smoke test: 13 routes 200, 18 internal hrefs 200 |
| V.1 | 2026-05-17 | DONE | §Phase V.1 | ce7153a | README.md rewritten; original moved to `project/HANDOFF.md` |
| V.2 | 2026-05-17 | DONE | §Phase V.2 | ce7153a | `.vercelignore` hides `project/` + `docs/` from prod |
| II.3 | 2026-05-17 | DONE | §Phase II.3 | ce7153a | `git init`, initial commit, README content verified in commit |
| II.4 | 2026-05-17 | AWAITING USER | §Phase II.4 | — | GitHub push + Vercel dashboard import (instructions in Status section above) |

## Phase I — Lift remaining prototype pages to root

### Steps I.1-I.5 — page lifts
- **Status:** DONE (all 5)
- **Plan ref:** Phase I, Steps I.1 through I.5
- **Files created:** `about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html`
- **What changed:** Pure file copies from `project/` to repo root.
- **Verification results:**
  - [x] All 5 files byte-identical to source (`diff -q` clean for each)
  - [x] No `image-slot` / `tweaks` / `EDITMODE` strings in any of the 5 (grep count = 0 each)
  - [x] `sections.html` has all 5 anchor IDs (`#road`, `#gravel`, `#track`, `#youth`, `#women`)
  - [x] `events.html` has `startCountdown` call
- **Risk realised:** None
- **Commit:** deferred to Step II.3 (single initial commit per deviation note)

## Phase II — Hosting plumbing

### Step II.1 — `vercel.json`
- **Status:** DONE
- **Files created:** [vercel.json](../../vercel.json)
- **What changed:** `cleanUrls: true`, `trailingSlash: false`, 4 security headers on `/(.*)`, 1-year immutable cache on `/assets/(.*)`. No CSP (deferred — would require tuning for Google Fonts + inline `<style>`).
- **Verification:** `node -e "JSON.parse(...)"` exits 0 ✓

### Step II.2 — `.gitignore`
- **Status:** DONE
- **Files created:** [.gitignore](../../.gitignore)
- **What changed:** Ignores `.DS_Store`, `.vercel/`, `node_modules/`, editor caches, `*.log`.

## Phase III — SEO + discoverability

### Step III.1 — Per-page meta (6 pages)
- **Status:** DONE
- **Files changed:** `index.html`, `about.html`, `sections.html`, `section-mtb.html`, `events.html`, `join.html` — each got 15 new meta tags between `<title>` and `<link rel="icon">`. For index.html the existing `<meta name="description">` was deleted before insertion to avoid duplicates.
- **Verification:**
  - [x] `grep -c 'rel="canonical"' *.html` = 6 (one per page)
  - [x] `grep -c 'property="og:image"' *.html` = 6
  - [x] Each page has exactly one `<meta name="description">` (count=1 per file)
  - [x] All 6 canonical URLs are unique
- **Titles set:** index `KÇ Prishtina 038 — Klubi Çiklistik i Prishtinës`, about `Klubi — KÇ Prishtina 038`, sections `Seksionet — KÇ Prishtina 038`, section-mtb `MTB — Seksioni 02 · KÇ Prishtina 038`, events `Kalendari 2026 — Garat e KÇ Prishtina 038`, join `Bashkohu — Apliko si anëtar i KÇ Prishtina 038`.

### Step III.2 — OG default image
- **Status:** DONE
- **Files created:** [assets/og-default.jpg](../../assets/og-default.jpg) (1200×630, 43350 B)
- **What changed:** Python+Pillow stopgap: ink (`#0F1A2E`) background, logo at left (220px), "KÇ PRISHTINA 038" title in Arial Bold 72px, "Klubi Çiklistik · Prishtinë" subtitle 24px in slate, "UCI · ECU · FÇK · est. 2022" line 20px in ember, ember stripe along bottom edge.
- **Verification:** `sips -g pixelWidth -g pixelHeight` → 1200×630 ✓. File 43 KB (under 300 KB target).
- **Deviation:** Plan offered an `magick` recipe; macOS doesn't have it. Used Pillow instead — same output, no functional difference.

### Step III.3 — `robots.txt`
- **Status:** DONE
- **Files created:** [robots.txt](../../robots.txt)

### Step III.4 — `sitemap.xml`
- **Status:** DONE
- **Files created:** [sitemap.xml](../../sitemap.xml)
- **Verification:** `xmllint --noout` exits 0 ✓, 6 `<url>` entries ✓

## Phase IV — Images + form

### Step IV.1 — `assets/photos/` + README
- **Status:** DONE
- **Files created:** [assets/photos/README.md](../../assets/photos/README.md)

### Step IV.2 — Wire join form to mailto
- **Status:** DONE
- **Files changed:** `join.html` — inner wrapper `<div style="margin-top: 32px;">…</div>` (was at lines 269-324 after Phase III.1 head expansion) replaced with `<form action="mailto:info@prishtina038.cc" method="POST" enctype="text/plain" style="margin-top: 32px;">…</form>`. Added `name=`, `id=`, `for=` to all 7 fields; `required` on 5 (name, age, email, section, experience); slugified `value=` on `<option>` elements; honeypot `name="_gotcha"`; submit button changed from `type="button" onclick="alert(…)"` to `type="submit"` with the demo handler removed.
- **Verification:**
  - [x] `grep -c "<form " join.html` = 1
  - [x] Unnamed `<input|select|textarea>` count = 0
  - [x] `grep -c 'onclick="alert' join.html` = 0
  - [x] `grep -c 'type="submit"' join.html` = 1
  - [x] Honeypot field present
- **TODO:** Upgrade to Formspree free tier when account is created. Replace the form `action` with the Formspree endpoint and drop `enctype="text/plain"`.

### Step IV.3 — Link smoke test
- **Status:** DONE
- **What ran:** Python `http.server` on 127.0.0.1:8765 + script that fetched every internal `href`/`src` across all 6 pages.
- **Verification:**
  - [x] All 13 known routes return 200 (6 HTML, robots.txt, sitemap.xml, 4 assets)
  - [x] 18 unique internal links across pages — all 200
  - [x] No broken internal links

## Phase V — Repo hygiene

### Step V.1 — README rewrite + HANDOFF preservation
- **Status:** DONE
- **Files changed:** [README.md](../../README.md) (rewritten), [project/HANDOFF.md](../../project/HANDOFF.md) (new, 22 lines, copy of original README)
- **What changed:** Root README is now the project README (structure, dev, deploy, i18n, images sections). The design-handoff text moved verbatim to `project/HANDOFF.md` to preserve provenance.

### Step V.2 — `.vercelignore`
- **Status:** DONE
- **Files created:** [.vercelignore](../../.vercelignore)
- **What changed:** Hides `project/` and `docs/` from production deploy. Repo-level git history is unaffected — both folders remain in the public GitHub repo, just not exposed at the Vercel URL.
