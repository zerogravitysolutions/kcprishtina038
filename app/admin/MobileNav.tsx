"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNavIcon, type AdminIcon } from "./AdminNav";

export type MobileNavItem = { id: string; label: string; href: string; icon: AdminIcon };
export type MobileNavGroup = { group: string; items: MobileNavItem[] };

/** Albanian display names for roles (the stored value stays the raw role). */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};

export function MobileNav({ groups, profileName, profileRole }: { groups: MobileNavGroup[]; profileName: string; profileRole: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={open ? "Mbyll menynë" : "Hap menynë"}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <>
              <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {/* Portal to <body> so the fixed drawer escapes the top bar's stacking
          context (the top bar uses backdrop-filter, which would otherwise trap
          fixed children inside its ~56px box). */}
      {open && mounted && createPortal(
        <>
          <div className="mobile-nav-backdrop" onClick={() => setOpen(false)} />
          <aside className="mobile-nav-drawer" role="dialog" aria-label="Menyja kryesore">
            <div className="mobile-nav-head">
              <div className="who">
                <div className="nm">{profileName}</div>
                <div className="rl">{ROLE_LABEL[profileRole] ?? profileRole}</div>
              </div>
              <button type="button" aria-label="Mbyll" onClick={() => setOpen(false)} className="mobile-nav-close">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <nav className="mobile-nav-list">
              {groups.map(g => (
                <div key={g.group}>
                  <div className="mobile-nav-group">{g.group}</div>
                  {g.items.map(it => {
                    const active = pathname === it.href || (it.href !== "/admin/dashboard" && pathname?.startsWith(it.href + "/"));
                    return (
                      <Link key={it.id} href={it.href} className={`mobile-nav-item ${active ? "active" : ""}`}>
                        <span className="ic"><AdminNavIcon name={it.icon} /></span>{it.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
