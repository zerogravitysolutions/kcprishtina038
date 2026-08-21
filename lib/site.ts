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
 * address.
 *
 * THE INTENDED PRODUCTION DOMAIN IS https://prishtinacycling.com (the club's own
 * addresses already use it). It is deliberately NOT hardcoded here: at the time
 * of writing it does not resolve yet, and hardcoding a host before DNS is live
 * re-creates the exact bug above. The switch is ONE step and no code change —
 * set NEXT_PUBLIC_SITE_URL=https://prishtinacycling.com in the Vercel project
 * once the domain serves the site, and canonicals, og:url, app/sitemap.ts and
 * app/robots.ts all follow it.
 *
 * CAUTION: whatever that variable says wins. Setting it before the domain
 * actually answers points every canonical at a dead host again.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://kcprishtina038.vercel.app"
).replace(/\/$/, "");
