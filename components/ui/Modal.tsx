"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When true, the modal stretches wide for embedded content (iframe etc). */
  wide?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Modal({ open, onClose, title, wide, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,26,46,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 5vh",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: wide ? 1100 : 560,
          background: "var(--paper)",
          color: "var(--ink)",
          borderRadius: 14,
          boxShadow: "0 30px 60px -20px rgba(15,26,46,0.4)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {title && (
            <div
              className="display"
              style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}
            >
              {title}
            </div>
          )}
          {!title && <div style={{ flex: 1 }} />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Mbyll"
            className="mono"
            style={{
              appearance: "none",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              color: "var(--ink-3)",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--line)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
