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
├── .vercelignore          # Hides project/ and docs/ from prod deploy
├── assets/
│   ├── styles.css         # Design system
│   ├── app.js             # i18n (SQ/EN), countdown, scroll reveal
│   ├── logo.jpg
│   ├── og-default.jpg     # 1200x630 social preview
│   └── photos/            # Real photography (see photos/README.md)
├── docs/
│   └── plan/              # Implementation plans + logs
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
