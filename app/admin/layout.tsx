import "./admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { adminSignOut } from "./actions";
import type { UserRole } from "@/lib/supabase/types";
import { MobileNav } from "./MobileNav";
import { AdminSideNav, type AdminNavGroup, type AdminIcon } from "./AdminNav";

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: string; label: string; href: string; icon: AdminIcon; allow?: UserRole[] }> }> = [
  {
    group: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: "grid", allow: ["admin", "editor", "staff"] },
      { id: "applications", label: "Applications", href: "/admin/applications", icon: "inbox", allow: ["admin", "editor", "staff"] },
    ],
  },
  {
    group: "Roster",
    items: [
      { id: "members", label: "Members (llogaritë)", href: "/admin/members", icon: "users", allow: ["admin", "editor", "staff"] },
      { id: "team-members", label: "Team (ekipi publik)", href: "/admin/team-members", icon: "team", allow: ["admin", "editor"] },
      { id: "sections", label: "Sections", href: "/admin/sections", icon: "layers", allow: ["admin", "editor", "staff"] },
    ],
  },
  {
    group: "Calendar",
    items: [
      { id: "events", label: "Events", href: "/admin/events", icon: "calendar", allow: ["admin", "editor", "staff"] },
      { id: "races", label: "Garat (katalogu)", href: "/admin/races", icon: "flag", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "Trajnimet",
    items: [
      { id: "training", label: "Stërvitjet", href: "/admin/training", icon: "activity" },
      { id: "athletes", label: "Çiklistët", href: "/admin/athletes", icon: "bike" },
      { id: "progress", label: "Progresi mujor", href: "/admin/training/progress", icon: "chart" },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "news", label: "News", href: "/admin/news", icon: "news", allow: ["admin", "editor"] },
      { id: "media", label: "Media library", href: "/admin/media", icon: "image", allow: ["admin", "editor"] },
      { id: "documents", label: "Documents", href: "/admin/documents", icon: "file", allow: ["admin", "editor"] },
      { id: "sponsors", label: "Sponsors", href: "/admin/sponsors", icon: "star", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "System",
    items: [{ id: "settings", label: "Settings", href: "/admin/settings", icon: "settings", allow: ["admin"] }],
  },
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/login");
  const staffRoles: UserRole[] = ["admin", "editor", "staff", "coach"];
  if (!staffRoles.includes(profile.role)) redirect("/portal");

  const visibleGroups: AdminNavGroup[] = NAV_GROUPS.map(g => ({
    group: g.group,
    items: g.items.filter(it => !it.allow || it.allow.includes(profile.role)).map(it => ({ id: it.id, label: it.label, href: it.href, icon: it.icon })),
  })).filter(g => g.items.length > 0);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/">
          <img src="/assets/logo.jpg" alt="" />
          <div className="brand-text">
            <span className="kc">Prishtina 038</span>
            <span className="sub">Admin · v0.9</span>
          </div>
        </Link>

        <AdminSideNav groups={visibleGroups} />

        <div className="side-foot">
          <div className="me">
            <div className="avatar">{initials(profile.full_name)}</div>
            <div className="who">
              {profile.full_name}
              <span>{profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}</span>
            </div>
          </div>
          <form action={adminSignOut}>
            <button type="submit" className="side-signout">
              <span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12H3M9 6l-6 6 6 6M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></svg></span>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <header className="top">
        <MobileNav groups={visibleGroups} profileName={profile.full_name} profileRole={profile.role} />
        <div className="crumbs">
          <Link href="/admin/dashboard">Admin</Link>
        </div>
        <div className="actions">
          <Link className="public-link" href="/" target="_blank">View site ↗</Link>
          <form action={adminSignOut} className="mobile-signout">
            <button type="submit" aria-label="Sign out" className="public-link">Sign out</button>
          </form>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
