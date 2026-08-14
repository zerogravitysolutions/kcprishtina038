"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminIcon =
  | "grid" | "inbox" | "users" | "team" | "layers" | "calendar" | "flag"
  | "activity" | "bike" | "chart" | "news" | "image" | "file" | "star" | "settings"
  | "euro" | "receipt" | "tag";

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: AdminIcon;
  /**
   * Extra path prefixes this row owns for the ACTIVE state only — never
   * rendered, never linked. Some real screens have no row of their own
   * (/admin/applications, /admin/athletes/[id], /admin/team-members/[id]);
   * without this the sidebar goes blank the moment you open one.
   * Prefixes must stay disjoint across rows so the winner is unambiguous.
   */
  owns?: string[];
};
export type AdminNavGroup = { group: string; items: AdminNavItem[] };

export function AdminNavIcon({ name }: { name: AdminIcon }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "inbox": return <svg {...p}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13 6 5h12l2 8v6H4z" /></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" /><path d="M17 8.2a3.5 3.5 0 0 1 0 6.6M22 21c0-2.4-1.4-4-3.5-4.7" /></svg>;
    case "team": return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "layers": return <svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case "flag": return <svg {...p}><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>;
    case "activity": return <svg {...p}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>;
    case "bike": return <svg {...p}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17 11 8h3M9 8h5l3 9" /></svg>;
    case "chart": return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "news": return <svg {...p}><path d="M4 5h16v14a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3V5Z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
    case "image": return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m21 16-5-5L5 21" /></svg>;
    case "file": return <svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>;
    case "star": return <svg {...p}><path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9 12 3Z" /></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" /></svg>;
    case "euro": return <svg {...p}><path d="M17 5.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 18.5" /><path d="M4 10.5h8M4 13.5h8" /></svg>;
    case "receipt": return <svg {...p}><path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3H5Z" /><path d="M9 8h6M9 12h6" /></svg>;
    // A priced tier, for "Planet e anëtarësisë". It sits next to Seksionet,
    // which already owns "layers" — two identical glyphs one under the other in
    // the same group is a menu you have to read instead of scan.
    case "tag": return <svg {...p}><path d="M13 3H5a2 2 0 0 0-2 2v8l8.6 8.6a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L13 3Z" /><circle cx="7.6" cy="7.6" r="1.3" /></svg>;
  }
}

/**
 * Which single nav item is active for a pathname — longest match wins.
 *
 * A plain `startsWith` rule lights up two items whenever one nav href is a
 * prefix of another (/admin/finance and /admin/finance/expenses,
 * /admin/training and /admin/training/progress). Rather than hand-patching each
 * collision as it appears, the rule itself is fixed: of every item whose href
 * the pathname sits under, only the MOST specific one is active. Hrefs are
 * unique, so exactly one item can win.
 *
 * Both the sidebar and the mobile drawer call this, so the two can never
 * disagree about what is selected.
 */
export function activeNavHref(pathname: string | null, groups: AdminNavGroup[]): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const it of g.items) {
      // `owns` competes on the length of the MATCHED prefix, not on the row's
      // own href, so an owned sub-tree still loses to a row that sits deeper.
      for (const base of it.owns ? [it.href, ...it.owns] : [it.href]) {
        if (pathname !== base && !pathname.startsWith(base + "/")) continue;
        if (base.length > bestLen) { bestLen = base.length; best = it.href; }
      }
    }
  }
  return best;
}

function Item({ item, active }: { item: AdminNavItem; active: boolean }) {
  return (
    <Link href={item.href as never} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="ic"><AdminNavIcon name={item.icon} /></span>
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminSideNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const active = activeNavHref(pathname, groups);
  return (
    <>
      {/* Two groups carry no heading — Paneli at the top and Cilësimet at the
          bottom, positions that label themselves. They stay REAL groups with
          real items so activeNavHref() keeps seeing them; moving Cilësimet into
          .side-foot would drop it out of the array the active rule iterates and
          the only way to light it again would be a startsWith rule.
          Key on the first item's id, not on g.group: the two empty headings
          would collide as React keys. */}
      {groups.map((g) => (
        <div key={g.items[0]?.id ?? g.group}>
          {g.group ? <div className="nav-group">{g.group}</div> : null}
          {g.items.map((it) => <Item key={it.id} item={it} active={it.href === active} />)}
        </div>
      ))}
    </>
  );
}
