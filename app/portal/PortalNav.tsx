"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type IconName = "home" | "activity" | "chart" | "user" | "trophy" | "grid";
export type PortalItem = { href: string; label: string; icon: IconName };

function Icon({ name }: { name: IconName }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home": return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "activity": return <svg {...p}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>;
    case "chart": return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "trophy": return <svg {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3M9 21h6M12 15v6" /></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  }
}

function useActive(href: string) {
  const pathname = usePathname();
  if (!pathname) return false;
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(href + "/");
}

export function PortalLink({ href, label, icon }: PortalItem) {
  const active = useActive(href);
  return (
    <Link href={href as never} className={`portal-link ${active ? "active" : ""}`}>
      <Icon name={icon} /> {label}
    </Link>
  );
}

export function PortalBottomNav({ items }: { items: PortalItem[] }) {
  return (
    <nav className="portal-bottomnav" aria-label="Navigimi">
      {items.map((it) => <BottomTab key={it.href} {...it} />)}
    </nav>
  );
}

function BottomTab({ href, label, icon }: PortalItem) {
  const active = useActive(href);
  return (
    <Link href={href as never} className={`portal-tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} /> {label}
    </Link>
  );
}
