"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminIcon =
  | "grid" | "inbox" | "users" | "team" | "layers" | "calendar" | "flag"
  | "activity" | "bike" | "chart" | "news" | "image" | "file" | "star" | "settings";

export type AdminNavItem = { id: string; label: string; href: string; icon: AdminIcon };
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
  }
}

function useActive(href: string) {
  const pathname = usePathname();
  if (!pathname) return false;
  if (href === "/admin/dashboard") return pathname === "/admin/dashboard";
  // Progresi mujor lives under /admin/training/progress — keep it distinct from the list.
  if (href === "/admin/training") return pathname === "/admin/training" || (pathname.startsWith("/admin/training/") && !pathname.startsWith("/admin/training/progress"));
  return pathname === href || pathname.startsWith(href + "/");
}

function Item({ item }: { item: AdminNavItem }) {
  const active = useActive(item.href);
  return (
    <Link href={item.href as never} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="ic"><AdminNavIcon name={item.icon} /></span>
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminSideNav({ groups }: { groups: AdminNavGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.group}>
          <div className="nav-group">{g.group}</div>
          {g.items.map((it) => <Item key={it.id} item={it} />)}
        </div>
      ))}
    </>
  );
}
