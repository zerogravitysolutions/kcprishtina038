"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNavIcon, activeNavHref, type AdminNavItem, type AdminNavGroup } from "./AdminNav";

// Aliases of the sidebar's own types, never a second copy: a hand-written twin
// silently dropped `owns` here, and the drawer would then have lit a different
// row than the sidebar behind it on /admin/applications and /admin/athletes.
export type MobileNavItem = AdminNavItem;
export type MobileNavGroup = AdminNavGroup;

/** Albanian display names for roles (the stored value stays the raw role). */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Redaktor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};

export function MobileNav({ groups, profileName, profileRole }: { groups: MobileNavGroup[]; profileName: string; profileRole: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  // The same longest-match-wins rule the sidebar uses, from the same helper:
  // exactly one item is selected, and the drawer can never disagree with the
  // sidebar behind it.
  const activeHref = activeNavHref(pathname, groups);

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
              {/* Same conditional heading as the sidebar: the unheaded groups
                  (Paneli, Cilësimet) render their items with no label, and the
                  key is the first item's id because two empty strings collide. */}
              {groups.map(g => (
                <div key={g.items[0]?.id ?? g.group}>
                  {g.group ? <div className="mobile-nav-group">{g.group}</div> : null}
                  {g.items.map(it => {
                    const active = it.href === activeHref;
                    return (
                      <Link
                        key={it.id}
                        href={it.href}
                        className={`mobile-nav-item ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
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
