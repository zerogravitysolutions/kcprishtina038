"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Thin top progress bar shown during client-side navigation — non-jarring
// feedback (the current page stays visible; no full-page skeleton flash).
// Starts on an internal link click, trickles up, completes when the new route
// renders (pathname change).
export function TopProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);

  // Start on same-origin link clicks.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
      setWidth(12);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Trickle toward 90% while active (+ a safety auto-finish).
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.15 : w)), 180);
    const safety = setTimeout(() => setActive(false), 10000);
    return () => { clearInterval(tick); clearTimeout(safety); };
  }, [active]);

  // Complete when the route actually changes.
  useEffect(() => {
    if (!active) return;
    setWidth(100);
    const t = setTimeout(() => { setActive(false); setWidth(0); }, 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0, height: 3, zIndex: 9999,
        width: `${width}%`, opacity: active ? 1 : 0,
        background: "linear-gradient(90deg, #C25A2D, #E8935A)",
        boxShadow: "0 0 8px rgba(194,90,45,.55)",
        transition: "width .2s ease, opacity .3s ease",
        pointerEvents: "none",
      }}
    />
  );
}
