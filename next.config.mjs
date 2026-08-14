import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Re-enable in Phase VII once all routes exist in app/.
  typedRoutes: false,

  // Client-side router cache. Next 15 defaults dynamic routes to 0s, so every
  // navigation re-fetches from the server even for prefetched/just-visited
  // pages. Our public pages are dynamic (locale cookie) but their content is
  // stable, so cache prefetched/visited routes briefly → back/forth and
  // prefetched clicks are instant.
  experimental: {
    staleTimes: { dynamic: 120, static: 300 },
  },

  images: {
    // Supabase Storage serves our media/ bucket here.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xutklvcsdgzmhxzexisb.supabase.co",
        pathname: "/storage/v1/object/public/media/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async redirects() {
    return [
      // Legacy URL kept reachable after the Next.js route was nested under /sections/.
      { source: "/section-mtb", destination: "/sections/mtb", permanent: true },
    ];
  },

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
        // The admin panel is used from a phone, and recording an expense offers
        // "Bëj foto" — an <input type="file" capture="environment"> for shooting
        // the receipt in the shop. The HTML Media Capture spec has the user agent
        // consult the `camera` permissions policy for `capture`, so the blanket
        // camera=() above can turn that button into a plain file picker on
        // Chromium. Re-allow the camera for our own origin here only; the public
        // site keeps the deny, and microphone/geolocation stay denied everywhere.
        // This must come AFTER the /:path* block — later matches win in Next.
        source: "/admin/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
