"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NavLink = { href: string; label: string };

type Props = {
  links: NavLink[];
  signin: { href: string; label: string; authed: boolean };
  ctaLabel: string;
  ctaHref: string;
};

// Mobile hamburger trigger + slide-down sheet with the public nav links.
// Visible only below the desktop breakpoint (controlled by globals.css
// `.nav-mobile-trigger` + `.nav-mobile-sheet`).
export function MobileMenu({ links, signin, ctaLabel, ctaHref }: Props) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="nav-mobile-trigger"
        aria-label="Hap menynë"
        aria-expanded={open}
        aria-controls="mobile-nav-sheet"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`nav-burger ${open ? "is-open" : ""}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <div
        id="mobile-nav-sheet"
        className={`nav-mobile-sheet ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigimi i faqes"
        aria-hidden={!open}
      >
        <button
          type="button"
          className="nav-mobile-backdrop"
          aria-label="Mbyll menynë"
          onClick={() => setOpen(false)}
          tabIndex={open ? 0 : -1}
        />
        <nav className="nav-mobile-panel" aria-hidden={!open}>
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href as never}
                  onClick={() => setOpen(false)}
                  tabIndex={open ? 0 : -1}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="nav-mobile-footer">
            <Link
              href={signin.href as never}
              onClick={() => setOpen(false)}
              className={`nav-mobile-signin ${signin.authed ? "is-authed" : ""}`}
              tabIndex={open ? 0 : -1}
            >
              {signin.label}
            </Link>
            <Link
              href={ctaHref as never}
              onClick={() => setOpen(false)}
              className="btn btn-ember nav-mobile-cta"
              tabIndex={open ? 0 : -1}
            >
              <span>{ctaLabel}</span>
              <svg className="arrow" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
