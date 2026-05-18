"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __strava_embed_loaded?: boolean;
  }
}

type Parsed = { type: "route" | "segment" | "activity"; id: string } | null;

function parseStravaUrl(raw: string): Parsed {
  // Accepts plain numeric IDs, /routes/<id>, /segments/<id>, /activities/<id>,
  // optionally with trailing slash, query string, or /embed suffix.
  const m = raw.match(/strava\.com\/(routes|segments|activities)\/(\d+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const type =
    kind === "routes" ? "route" : kind === "segments" ? "segment" : "activity";
  return { type, id: m[2] };
}

/**
 * Strava's official embed widget — works for routes, segments and activities.
 * It scans the document for `.strava-embed-placeholder` elements at script
 * load and on each `embed:rendered` event, so re-mounting (e.g. via React
 * navigation) needs us to nudge it to re-scan.
 */
export function StravaEmbed({ url }: { url: string }) {
  const parsed = parseStravaUrl(url);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parsed) return;

    function loadScript() {
      if (document.querySelector('script[src="https://strava-embeds.com/embed.js"]')) {
        // Already on the page — trigger a re-scan by appending a fresh copy
        // (the script self-removes after running so this is safe).
        const s = document.createElement("script");
        s.src = "https://strava-embeds.com/embed.js";
        s.async = true;
        document.body.appendChild(s);
        return;
      }
      const s = document.createElement("script");
      s.src = "https://strava-embeds.com/embed.js";
      s.async = true;
      document.body.appendChild(s);
    }

    loadScript();
  }, [parsed?.type, parsed?.id]);

  if (!parsed) return null;

  return (
    <div className="kc-strava">
      <div
        ref={ref}
        className="strava-embed-placeholder"
        data-embed-type={parsed.type}
        data-embed-id={parsed.id}
        data-style="standard"
        data-from-embed="false"
        // Reserve the space so layout doesn't jump while the widget loads.
        style={{ minHeight: 520 }}
      />
    </div>
  );
}
