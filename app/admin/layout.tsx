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
    group: "Hapësira e punës",
    items: [
      { id: "dashboard", label: "Paneli", href: "/admin/dashboard", icon: "grid", allow: ["admin", "editor", "staff"] },
      { id: "applications", label: "Aplikimet", href: "/admin/applications", icon: "inbox", allow: ["admin", "editor", "staff"] },
    ],
  },
  {
    group: "Regjistri",
    items: [
      // One entry, one list. "Anëtarët (llogaritë)" and "Ekipi (publik)" were
      // the same people seen through two tables; /admin/people shows each
      // person once and says which facets they have. The role bar is the union
      // of the two old ones — every write is still gated on the server.
      { id: "people", label: "Njerëzit", href: "/admin/people", icon: "users", allow: ["admin", "editor", "staff"] },
      { id: "sections", label: "Seksionet", href: "/admin/sections", icon: "layers", allow: ["admin", "editor", "staff"] },
      // A membership plan is a catalogue row like a section: an admin-managed
      // tier, shown on the public registration form, that a person gets put
      // into. The screen itself counts members per tier and has no money
      // movement on it, so it belongs to the register, not to Financat. The
      // money view of the tiers lives on the Pasqyra ("Sipas planit").
      { id: "plans", label: "Planet e anëtarësisë", href: "/admin/plans", icon: "tag", allow: ["admin"] },
    ],
  },
  {
    group: "Kalendari",
    items: [
      { id: "events", label: "Eventet", href: "/admin/events", icon: "calendar", allow: ["admin", "editor", "staff"] },
      { id: "races", label: "Garat (katalogu)", href: "/admin/races", icon: "flag", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "Stërvitja",
    items: [
      { id: "training", label: "Stërvitjet", href: "/admin/training", icon: "activity" },
      { id: "progress", label: "Progresi", href: "/admin/training/progress", icon: "chart" },
    ],
  },
  {
    // Mirrors the dues_write_staff / club_funds / club_expenses policies
    // (migrations 0006 and 20260810000002): admin + staff move money, and the
    // expense ledger shows what the club pays individual people, so this group
    // is never widened to editors or coaches.
    //
    // The group is split on ONE axis: where money is WRITTEN versus where the
    // position is READ. Three ledgers — member invoices, money in, money out —
    // and one place that reads them all. "Arka e klubit" and "Raportet
    // financiare" were two read screens that printed the same debt, the same
    // billed total and the same collection rate off differently capped
    // queries; they are now two views of Pasqyra financiare (?v=), where each
    // figure is computed once.
    group: "Financat",
    items: [
      { id: "finance", label: "Faturat e anëtarëve", href: "/admin/finance", icon: "receipt", allow: ["admin", "staff"] },
      { id: "finance-funds", label: "Hyrjet e klubit", href: "/admin/finance/funds", icon: "inbox", allow: ["admin", "staff"] },
      { id: "finance-expenses", label: "Shpenzimet", href: "/admin/finance/expenses", icon: "file", allow: ["admin", "staff"] },
      { id: "finance-overview", label: "Pasqyra financiare", href: "/admin/finance/overview", icon: "euro", allow: ["admin", "staff"] },
    ],
  },
  {
    group: "Përmbajtja",
    items: [
      { id: "news", label: "Lajmet", href: "/admin/news", icon: "news", allow: ["admin", "editor"] },
      { id: "media", label: "Biblioteka e medias", href: "/admin/media", icon: "image", allow: ["admin", "editor"] },
      { id: "documents", label: "Dokumentet", href: "/admin/documents", icon: "file", allow: ["admin", "editor"] },
      { id: "sponsors", label: "Sponsorët", href: "/admin/sponsors", icon: "star", allow: ["admin", "editor"] },
    ],
  },
  {
    group: "Sistemi",
    items: [{ id: "settings", label: "Cilësimet", href: "/admin/settings", icon: "settings", allow: ["admin"] }],
  },
];

/** Albanian display names for roles (the stored value stays the raw role). */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Redaktor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};

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
            <span className="sub">Admin · v2.8</span>
          </div>
        </Link>

        <AdminSideNav groups={visibleGroups} />

        <div className="side-foot">
          <div className="me">
            <div className="avatar">{initials(profile.full_name)}</div>
            <div className="who">
              {profile.full_name}
              <span>{ROLE_LABEL[profile.role] ?? profile.role}</span>
            </div>
          </div>
          <form action={adminSignOut}>
            <button type="submit" className="side-signout">
              <span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12H3M9 6l-6 6 6 6M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></svg></span>
              Dil
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
          <Link className="public-link" href="/" target="_blank">Shiko faqen ↗</Link>
          <form action={adminSignOut} className="mobile-signout">
            <button type="submit" aria-label="Dil" className="public-link">Dil</button>
          </form>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
