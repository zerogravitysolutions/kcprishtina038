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

These ratios come from the CSS rules in `../styles.css`:
- `.rider .ph { aspect-ratio: 3/4 }` (line 484)
- `.news-card .ph { aspect-ratio: 4/3 }` (line 545)
- `.product .ph { aspect-ratio: 1 }` (line 691)

## Format

JPEG q=82-85 for photos; WebP if you can supply both (the site will be
updated to use `<picture>` in a follow-up). PNG only for logos with
transparency.

## Swapping a placeholder for a real photo

Find the `<div class="ph">…</div>` (or, on the landing page, the
`<div class="slot s1">…</div>`) and replace its inner content with:

```html
<img src="assets/photos/hero-team.jpg" alt="<descriptive alt>" loading="lazy" />
```

The styled placeholder will disappear (the `<img>` covers it). Keep
`loading="lazy"` on everything below the fold; remove it only from the
landing hero's `.s1` (above the fold).
