"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type DocItem = {
  id: string;
  title: string;
  url: string;
  date: string | null;
  size: string | null;
  pages: number | null;
  description: string | null;
};

export function DocsList({ items }: { items: DocItem[] }) {
  const [open, setOpen] = useState<DocItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <ul className="docs-list">
        {items.map((d) => (
          <li key={d.id} className="docs-item">
            <button type="button" className="docs-item__inner" onClick={() => setOpen(d)}>
              <span className="docs-icon" aria-hidden="true">
                <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
                  <path d="M3 1 H14 L21 8 V25 H3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
                  <path d="M14 1 V8 H21" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
                  <text x="11" y="20" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6" fill="currentColor">PDF</text>
                </svg>
              </span>
              <span className="docs-item__body">
                <span className="docs-item__title">{d.title}</span>
                <span className="docs-item__meta mono">
                  {d.date && <span>{d.date}</span>}
                  {d.size && <span>{d.size}</span>}
                  {d.pages && <span>{d.pages} f.</span>}
                </span>
                {d.description && <span className="docs-item__desc">{d.description}</span>}
              </span>
              <span className="docs-item__cta mono" aria-hidden="true">
                Lexo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && mounted && createPortal(
        <div className="docv-backdrop" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="docv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="docv-head">
              <div className="docv-title">{open.title}</div>
              <button type="button" className="docv-close" onClick={() => setOpen(null)} aria-label="Mbyll">✕</button>
            </div>
            {/* toolbar=0 hides the built-in PDF viewer's download/print controls. */}
            <iframe
              className="docv-frame"
              src={`${open.url}#toolbar=0&navpanes=0&statusbar=0&view=FitH`}
              title={open.title}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
