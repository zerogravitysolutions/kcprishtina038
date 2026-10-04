// Shared Strava URL helpers — used by the public StravaEmbed widget and by the
// coach ride editor (paste an activity link, embed it, remember the id).
//
// NOTE on the API: detailed activity metrics (HR / power) require the owner's
// OAuth token. The public embed may expose the distance, time and elevation
// summary; the coach enters those manually if the embed is unavailable.

export type StravaKind = "route" | "segment" | "activity";
export type ParsedStrava = { type: StravaKind; id: string } | null;

/**
 * Parse a canonical strava.com URL (or bare numeric id after a known path).
 * Accepts trailing slash, query string, or /embed suffix.
 * Shared deep links (strava.app.link/…) are NOT canonical — resolve them
 * server-side first (see resolveStravaUrl in the coach actions).
 */
export function parseStravaUrl(raw: string): ParsedStrava {
  if (!raw) return null;
  const m = raw.match(/strava\.com\/(routes|segments|activities)\/(\d+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const type: StravaKind =
    kind === "routes" ? "route" : kind === "segments" ? "segment" : "activity";
  return { type, id: m[2] };
}

/** Extract just the activity id from any strava.com/activities/<id> URL. */
export function stravaActivityId(raw: string): string | null {
  const p = parseStravaUrl(raw);
  return p && p.type === "activity" ? p.id : null;
}

/**
 * True for a genuine Strava mobile deep link (https://strava.app.link/…) that
 * needs server-side resolution. Parses and checks the HOST — never a substring
 * match, so a hostile URL that merely contains "strava.app.link/" in its path
 * or query can't slip through to a server-side fetch (SSRF).
 */
export function isStravaAppLink(raw: string): boolean {
  try {
    const u = new URL(raw ?? "");
    return u.protocol === "https:" && u.hostname.toLowerCase() === "strava.app.link";
  } catch {
    return false;
  }
}
