"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LightboxPhoto = {
  src: string;       // full-size URL
  width?: number;
  height?: number;
  alt?: string;
};

type Props = {
  photos: LightboxPhoto[];
  /** Index to open at. `null` = closed. */
  openIndex: number | null;
  onClose: () => void;
};

// Full-screen modal photo viewer. Keyboard: ESC closes, ←/→ navigate,
// Home/End jump. Touch: horizontal swipe. Click outside the image closes.
// Body scroll is locked while open. Neighbor images are preloaded.
export function Lightbox({ photos, openIndex, onClose }: Props) {
  const [index, setIndex] = useState<number>(openIndex ?? 0);
  const touchStartX = useRef<number | null>(null);
  const isOpen = openIndex !== null;

  // Sync internal index when parent opens a new photo.
  useEffect(() => {
    if (openIndex !== null) setIndex(openIndex);
  }, [openIndex]);

  const last = photos.length - 1;
  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = i + delta;
        if (next < 0) return 0;
        if (next > last) return last;
        return next;
      });
    },
    [last],
  );

  // Body scroll lock + keyboard handling while open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(last);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, go, last, onClose]);

  // Preload neighbors for fast nav.
  useEffect(() => {
    if (!isOpen) return;
    const toPreload = [index - 1, index + 1].filter((i) => i >= 0 && i <= last);
    toPreload.forEach((i) => {
      const img = new Image();
      img.src = photos[i].src;
    });
  }, [index, isOpen, last, photos]);

  if (!isOpen) return null;

  const current = photos[index];
  if (!current) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 26, 46, 0.94)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 4vw, 56px)",
        animation: "lb-fade .15s ease-out",
      }}
    >
      <style>{`
        @keyframes lb-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lb-pop { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
        .lb-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          width: 48px; height: 48px;
          display: grid; place-items: center;
          background: rgba(244, 242, 236, 0.08);
          color: var(--paper);
          border: 1px solid rgba(244, 242, 236, 0.15);
          border-radius: 999px;
          cursor: pointer;
          transition: background .12s, transform .12s;
        }
        .lb-btn:hover { background: rgba(244, 242, 236, 0.18); }
        .lb-btn:active { transform: translateY(-50%) scale(.94); }
        .lb-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .lb-btn[data-side=prev] { left: clamp(12px, 2vw, 28px); }
        .lb-btn[data-side=next] { right: clamp(12px, 2vw, 28px); }
        .lb-close {
          position: fixed; top: clamp(12px, 2vw, 24px); right: clamp(12px, 2vw, 24px);
          width: 42px; height: 42px; display: grid; place-items: center;
          background: rgba(244, 242, 236, 0.08);
          color: var(--paper);
          border: 1px solid rgba(244, 242, 236, 0.15);
          border-radius: 999px; cursor: pointer; transition: background .12s;
        }
        .lb-close:hover { background: rgba(244, 242, 236, 0.18); }
        .lb-counter {
          position: fixed; bottom: clamp(16px, 3vw, 28px); left: 50%; transform: translateX(-50%);
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--slate-2);
          padding: 8px 14px; background: rgba(244, 242, 236, 0.06);
          border: 1px solid rgba(244, 242, 236, 0.12);
          border-radius: 999px;
        }
        @media (max-width: 640px) {
          .lb-btn[data-side=prev], .lb-btn[data-side=next] { display: none; }
        }
      `}</style>

      <button
        type="button"
        className="lb-close"
        aria-label="Close (ESC)"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 3 L15 15 M15 3 L3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        className="lb-btn"
        data-side="prev"
        aria-label="Previous (←)"
        disabled={index === 0}
        onClick={(e) => { e.stopPropagation(); go(-1); }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M12 4 L6 10 L12 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        className="lb-btn"
        data-side="next"
        aria-label="Next (→)"
        disabled={index === last}
        onClick={(e) => { e.stopPropagation(); go(1); }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M8 4 L14 10 L8 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current.src}
        src={current.src}
        alt={current.alt ?? ""}
        width={current.width}
        height={current.height}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(1400px, 100%)",
          maxHeight: "calc(100vh - 120px)",
          objectFit: "contain",
          borderRadius: 4,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,.6)",
          animation: "lb-pop .15s ease-out",
        }}
      />

      <div className="lb-counter">
        {index + 1} / {photos.length}
      </div>
    </div>
  );
}
