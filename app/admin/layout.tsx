import "./admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { adminSignOut } from "./actions";
import type { UserRole } from "@/lib/supabase/types";
import { MobileNav, type MobileNavGroup } from "./MobileNav";

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: string; label: string; href: string; allow?: UserRole[] }> }> = [
  {
    group: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
      { id: "applications", label: "Applications", href: "/admin/applications", allow: ["admin", "editor", "staff"] },
    ],
  },
  {
    group: "Roster",
    items: [
      { id: "members", label: "Members (llogaritë)", href: "/admin/members", allow: ["admin", "editor", "staff"] },
      { id: "team-members", label: "Team (ekipi publik)", href: "/admin/team-members", allow: ["admin", "editor"] },
      { id: "sections", label: "Sections", href: "/admin/sections", allow: ["admin", "editor", "staff"] },
    ],
  },
  {
    group: "Calendar",
    items: [
      // Results now live inside each event (/admin/events/<id>/results),
      // so the standalone /admin/results entry is gone.
      { id: "events", label: "Events", href: "/admin/events" },
      { id: "races", label: "Garat (katalogu)", href: "/admin/races", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "Trajnimet",
    items: [
      { id: "training", label: "Stërvitjet", href: "/admin/training" },
      { id: "athletes", label: "Çiklistët", href: "/admin/athletes" },
      { id: "progress", label: "Progresi mujor", href: "/admin/training/progress" },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "news", label: "News", href: "/admin/news", allow: ["admin", "editor"] },
      { id: "media", label: "Media library", href: "/admin/media", allow: ["admin", "editor"] },
      { id: "documents", label: "Documents", href: "/admin/documents", allow: ["admin", "editor"] },
      { id: "sponsors", label: "Sponsors", href: "/admin/sponsors", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "System",
    items: [{ id: "settings", label: "Settings", href: "/admin/settings", allow: ["admin"] }],
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

  const mobileGroups: MobileNavGroup[] = NAV_GROUPS.map(g => ({
    group: g.group,
    items: g.items.filter(it => !it.allow || it.allow.includes(profile.role)).map(it => ({ id: it.id, label: it.label, href: it.href })),
  })).filter(g => g.items.length > 0);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/">
          <img src="/assets/logo.jpg" alt="" />
          <div className="brand-text">
            <span className="kc">Prishtina 038</span>
            <span className="sub">Admin · v0.2</span>
          </div>
        </Link>
        {NAV_GROUPS.map(g => {
          const visibleItems = g.items.filter(it => !it.allow || it.allow.includes(profile.role));
          if (!visibleItems.length) return null;
          return (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {visibleItems.map(it => (
                <Link key={it.id} className="nav-item" href={it.href}>
                  <span>{it.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
        <form action={adminSignOut} style={{ marginTop: "auto", padding: "8px 0" }}>
          <button type="submit" className="nav-item" style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, color: "var(--err, #c25a2d)", cursor: "pointer" }}>
            Sign out →
          </button>
        </form>
        <div className="me">
          <div className="avatar">{initials(profile.full_name)}</div>
          <div className="who">
            {profile.full_name}
            <span>{profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}</span>
          </div>
        </div>
      </aside>
      <header className="top">
        <MobileNav groups={mobileGroups} profileName={profile.full_name} profileRole={profile.role} />
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
