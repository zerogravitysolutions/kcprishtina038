"use client";

import { useEffect, useRef } from "react";
import { parseStravaUrl } from "@/lib/strava";

declare global {
  interface Window {
    __strava_embed_loaded?: boolean;
  }
}

/**
 * Strava's official embed widget — works for routes, segments and activities.
 * It scans the document for `.strava-embed-placeholder` elements at script
 * load and on each `embed:rendered` event, so re-mounting (e.g. via React
 * navigation) needs us to nudge it to re-scan.
 */
export function StravaEmbed({ url, compact = false }: { url: string; compact?: boolean }) {
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
    <div className="kc-strava" style={compact ? { maxWidth: 460 } : undefined}>
      <div
        ref={ref}
        className="strava-embed-placeholder"
        data-embed-type={parsed.type}
        data-embed-id={parsed.id}
        data-style="standard"
        data-from-embed="false"
        // Reserve the space so layout doesn't jump while the widget loads.
        style={{ minHeight: compact ? 180 : 520 }}
      />
    </div>
  );
}
