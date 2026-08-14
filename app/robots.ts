import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * Generated robots.txt, replacing public/robots.txt (which pointed the sitemap
 * at https://prishtina038.cc — a hostname that does not resolve). Sharing
 * SITE_ORIGIN with app/sitemap.ts keeps the advertised origin in one place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Authenticated or per-member areas — nothing here is meant to be indexed.
          "/admin/", "/portal/", "/invoice/", "/login", "/auth/",
          // public/{about,sections,section-mtb}.html are NOT orphans: /about and
          // /sections/mtb read them at runtime through getLegacyBody(), so they
          // cannot be deleted or moved (Next only reliably ships public/ for a
          // runtime fs read). But they are also served raw at /about.html etc.,
          // which is the same content on a second URL. Keep the files, hide the
          // raw copies.
          "/*.html$",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    // No `host:` — the directive is non-standard (Google ignores it) and Next
    // would emit it verbatim with the scheme, which is not the form the few
    // crawlers that read it expect. The canonical host is already stated by
    // the sitemap URL and by metadataBase in app/layout.tsx.
  };
}
