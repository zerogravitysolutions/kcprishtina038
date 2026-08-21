import "./admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { adminSignOut } from "./actions";
import type { UserRole } from "@/lib/supabase/types";
import { MobileNav } from "./MobileNav";
import { AdminSideNav, type AdminNavGroup, type AdminIcon } from "./AdminNav";

/**
 * The admin menu: 4 headings, 16 rows.
 *
 * A heading is spent only where it separates one block of rows from another.
 * The two singletons that book-end the list — Paneli at the top, Cilësimet at
 * the bottom — carry `group: ""` and render with no label (see AdminSideNav and
 * MobileNav); their position says what they are. They stay real groups with
 * real items so activeNavHref() keeps seeing them.
 *
 * Every `allow` below either matches the page's own gate or narrows onto it.
 * An item with no `allow` is visible to a coach too, so no row is left without
 * one.
 */
const NAV_GROUPS: Array<{ group: string; items: Array<{ id: string; label: string; href: string; icon: AdminIcon; allow?: UserRole[]; owns?: string[] }> }> = [
  {
    group: "",
    items: [
      // Aplikimet no longer has a row: the dashboard IS the pending queue now,
      // with the real approve/reject actions on each line. The archive
      // (approved + rejected) stays one click away behind the card's
      // "Shiko të gjitha →" link to /admin/applications.
      // …so Paneli owns the /admin/applications sub-tree for the active state:
      // it is a real, reachable screen with no row of its own, and without this
      // the whole sidebar would go unlit while you stand on it.
      { id: "dashboard", label: "Paneli", href: "/admin/dashboard", icon: "grid", allow: ["admin", "editor", "staff"], owns: ["/admin/applications"] },
    ],
  },
  {
    group: "Klubi",
    items: [
      // One entry, one list. "Anëtarët (llogaritë)" and "Ekipi (publik)" were
      // the same people seen through two tables; /admin/people shows each
      // person once and says which facets they have. The role bar is the union
      // of the two old ones — every write is still gated on the server.
      // /admin/team-members is a redirect stub, but /admin/team-members/new and
      // /[id] are the real roster editor and are linked only from here — so
      // Njerëzit owns that sub-tree for the active state.
      { id: "people", label: "Njerëzit", href: "/admin/people", icon: "users", allow: ["admin", "editor", "staff"], owns: ["/admin/team-members", "/admin/members"] },
      // admin + editor, matching the page gate and sections_write_admin. Staff
      // used to see this row and get bounced straight back to the dashboard.
      { id: "sections", label: "Seksionet", href: "/admin/sections", icon: "layers", allow: ["admin", "editor"] },
      // A membership plan is a catalogue row like a section: an admin-managed
      // tier, shown on the public registration form, that a person gets put
      // into. The screen itself counts members per tier and has no money
      // movement on it, so it belongs to the register, not to Financat. The
      // money view of the tiers lives on the Pasqyra ("Sipas planit").
      { id: "plans", label: "Planet e anëtarësisë", href: "/admin/plans", icon: "tag", allow: ["admin"] },
    ],
  },
  {
    // "Kalendari" and "Stërvitja" were two headings over two rows each. A club
    // event, an attended race, a training session and its rollup are all "what
    // happened on the bike" — and for a coach that heading sits over their
    // entire sidebar either way.
    group: "Aktiviteti",
    items: [
      // admin + editor, which is what events_write_editor (migration
      // 20260517000006) already enforces. The nav, the page gate and
      // assertEditor() disagreed
      // three ways: staff saw a row that bounced them, and a coach could submit
      // an edit that RLS silently refused.
      { id: "events", label: "Eventet", href: "/admin/events", icon: "calendar", allow: ["admin", "editor"] },
      { id: "races", label: "Garat (katalogu)", href: "/admin/races", icon: "flag", allow: ["admin", "editor"] },
      // Written out rather than left empty. Both pages gate on the same four
      // roles, which is exactly what an absent `allow` produces today — but
      // only by accident of the current UserRole union, and a new role would
      // silently inherit training.
      { id: "training", label: "Stërvitjet", href: "/admin/training", icon: "activity", allow: ["admin", "editor", "staff", "coach"] },
      // The athlete profile is reachable only from the progress table, so
      // Progresi owns /admin/athletes for the active state.
      { id: "progress", label: "Progresi", href: "/admin/training/progress", icon: "chart", allow: ["admin", "editor", "staff", "coach"], owns: ["/admin/athletes"] },
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
      // "Biblioteka e medias" + "Dokumentet" in one row. Both are "a club file,
      // uploaded, given a URL", both are gated admin + editor at the page and in
      // RLS, so the ?v= merge needs no per-tab gating. The media half is a
      // read-only grid with zero actions and did not earn a top-level line;
      // documents keeps its full CRUD one click away.
      // Icon "image", not "file" — Shpenzimet already owns "file".
      { id: "files", label: "Skedarët", href: "/admin/files", icon: "image", allow: ["admin", "editor"] },
      // Sponsorët stays here, not under Financat: the screen edits a brand
      // (tier, logo, website, contract end) and is gated admin + editor, while
      // every Financat row is admin + staff. Moving it would either widen
      // Financat to editors or hide it from them.
      { id: "sponsors", label: "Sponsorët", href: "/admin/sponsors", icon: "star", allow: ["admin", "editor"] },
    ],
  },
  {
    // No heading: one admin-only row pinned at the bottom of the list. It stays
    // a real item in a real group so activeNavHref() is untouched.
    group: "",
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
    items: g.items.filter(it => !it.allow || it.allow.includes(profile.role)).map(it => ({ id: it.id, label: it.label, href: it.href, icon: it.icon, owns: it.owns })),
  })).filter(g => g.items.length > 0);

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/">
          <img src="/assets/logo.jpg" alt="" />
          <div className="brand-text">
            <span className="kc">Prishtina 038</span>
            <span className="sub">Admin · v4.0</span>
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
