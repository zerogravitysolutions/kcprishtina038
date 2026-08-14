/**
 * The origin the site advertises as its own: canonicals, og:url, the sitemap and
 * robots.txt all resolve against this one value.
 *
 * It lives here, in a plain module with no dependencies, rather than in
 * app/sitemap.ts — a Next metadata route also pulls in unstable_cache and the
 * Supabase client, and the root layout must not drag those into every server
 * render just to learn its own hostname. It would also break the day the sitemap
 * is split with generateSitemaps().
 *
 * The hardcoded default used to be https://prishtina038.cc, which does not
 * resolve in DNS — so every public page was naming a dead host as its canonical
 * address. Set NEXT_PUBLIC_SITE_URL in Vercel once the custom domain actually
 * serves the site and the sitemap, robots and canonicals all follow with no code
 * change. CAUTION: whatever that variable says wins, so pointing it at a domain
 * that is not live yet re-creates exactly the bug this replaced.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://kcprishtina038.vercel.app"
).replace(/\/$/, "");
