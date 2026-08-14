import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RolePicker } from "./RolePicker";
import { AddMember } from "./AddMember";
import { ManageMember } from "./ManageMember";
import { CreateAccount } from "./CreateAccount";
import { AddToRoster } from "./AddToRoster";
import { DeleteButton } from "../team-members/DeleteButton";
import { POSITION_LABEL } from "./positions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------------------------------------------
// ONE list of everybody in the club.
//
// The club has two identity tables and they cannot be merged:
//   profiles.id     references auth.users(id) on delete cascade  → a profile
//                   CANNOT exist without a login, so a 12-year-old rider with
//                   no email cannot have one. Money hangs off it
//                   (dues.member_id, memberships.member_id + ~15 more FKs).
//   team_members    has no such requirement. It is the public roster AND the
//                   athlete identity training uses
//                   (ride_entries.athlete_id, athlete_profiles.athlete_id).
//
// So the SCREEN is merged, not the tables. The bridge is the nullable
// team_members.profile_id, and this page makes it visible and actionable:
// every person appears EXACTLY ONCE with the facets they have, plus the one
// action that would give them the facet they are missing.
// ---------------------------------------------------------------------------

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  joined_at: string | null;
  section_id: string | null;
};

type RosterRow = {
  id: string;
  slug: string;
  full_name: string;
  positions: string[];
  section_slug: string | null;
  status: string;
  display_order: number;
  profile_id: string | null;
  photo: { storage_path: string } | null;
};

/** One human. `roster` is an array only to survive bad data: two roster rows
 * pointing at the same profile are ONE person, so they collapse into one line
 * instead of showing that person twice. */
type Person = {
  key: string;
  name: string;
  account: ProfileRow | null;
  roster: RosterRow[];
};

const ROLES = ["admin", "editor", "staff", "coach", "member"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Redaktor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  inactive: "Joaktiv",
  suspended: "Pezulluar",
  pending: "Në pritje",
};

const VIEWS = ["all", "no-account", "no-roster", "past"] as const;
type View = (typeof VIEWS)[number];

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function initials(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?";
}

type SearchParams = Promise<{ view?: string; role?: string; q?: string }>;

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  // ONE client for auth + data: separate createClient() calls don't share the
  // refreshed session in Server Components.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profileRow } = await supabase
    .from("profiles").select("id, role, status").eq("id", user.id).maybeSingle();
  const me = profileRow as { id: string; role: string; status: string } | null;
  if (!me) redirect("/login");
  // Union of the two old gates: /admin/members was admin+editor+staff,
  // /admin/team-members was admin+editor. Seeing the merged list grants
  // nothing — every mutation below is gated separately, on the server.
  if (!["admin", "editor", "staff"].includes(me.role)) redirect("/admin/dashboard");
  const canManageAccounts = me.role === "admin";              // requireAdmin()
  const canEditRoster = ["admin", "editor"].includes(me.role); // requireEditor()

  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "all";
  const roleFilter: Role | null = (ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as Role) : null;
  const q = (sp.q ?? "").trim();

  const [{ data: profileData }, { data: rosterData }, { data: sectionData }] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, role, status, joined_at, section_id")
      .order("full_name").limit(1000),
    supabase.from("team_members")
      .select("id, slug, full_name, positions, section_slug, status, display_order, profile_id, photo:media!photo_media_id(storage_path)")
      .order("display_order").order("last_name").limit(1000),
    supabase.from("sections").select("id, slug, name_sq"),
  ]);

  const profiles = (profileData as ProfileRow[] | null) ?? [];
  const roster = (rosterData as unknown as RosterRow[] | null) ?? [];
  const sectionRows = (sectionData as { id: string; slug: string; name_sq: string }[] | null) ?? [];
  // The roster stores a section SLUG, the profile a section UUID — two lookups
  // for one column.
  const sectionBySlug = new Map(sectionRows.map(s => [s.slug, s]));
  const sectionById = new Map(sectionRows.map(s => [s.id, s]));

  // --- the union, de-duplicated on team_members.profile_id -------------------
  const profileById = new Map(profiles.map(p => [p.id, p]));
  const people = new Map<string, Person>();

  for (const r of roster) {
    const linked = r.profile_id ? profileById.get(r.profile_id) ?? null : null;
    // Key on the profile when there is one: that is the dedupe rule. Two roster
    // rows linked to the same account are one person, one line.
    const key = linked ? `p:${linked.id}` : `t:${r.id}`;
    const existing = people.get(key);
    if (existing) existing.roster.push(r);
    else people.set(key, { key, name: r.full_name || linked?.full_name || "—", account: linked, roster: [r] });
  }
  // Accounts with no roster row at all (staff, admins, newly enrolled members).
  for (const p of profiles) {
    const key = `p:${p.id}`;
    if (!people.has(key)) people.set(key, { key, name: p.full_name, account: p, roster: [] });
  }

  const collator = new Intl.Collator("sq", { sensitivity: "base" });
  const all = Array.from(people.values()).sort((a, b) => collator.compare(a.name, b.name));

  // --- counts (always over the WHOLE club, not the filtered view) ------------
  const counts = {
    all: all.length,
    noAccount: all.filter(p => !p.account).length,
    noRoster: all.filter(p => p.roster.length === 0).length,
    past: all.filter(p => p.roster.length > 0 && p.roster.every(r => r.status === "past")).length,
  };
  const roleCounts: Record<string, number> = {};
  for (const p of all) if (p.account) roleCounts[p.account.role] = (roleCounts[p.account.role] ?? 0) + 1;
  const withAccount = all.length - counts.noAccount;

  // --- filters ---------------------------------------------------------------
  const needle = q.toLowerCase();
  const rows = all.filter(p => {
    if (view === "no-account" && p.account) return false;
    if (view === "no-roster" && p.roster.length > 0) return false;
    if (view === "past" && !(p.roster.length > 0 && p.roster.every(r => r.status === "past"))) return false;
    if (roleFilter && p.account?.role !== roleFilter) return false;
    if (needle) {
      const hay = [p.name, p.account?.email ?? "", p.roster[0]?.slug ?? ""].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  function href(next: { view?: View; role?: Role | null; q?: string }) {
    const params = new URLSearchParams();
    const v = next.view ?? view;
    const r = next.role === undefined ? roleFilter : next.role;
    const s = next.q ?? q;
    if (v !== "all") params.set("view", v);
    if (r) params.set("role", r);
    if (s) params.set("q", s);
    const qs = params.toString();
    return qs ? `/admin/people?${qs}` : "/admin/people";
  }

  function chip(label: string, target: string, count: number, active: boolean) {
    return (
      <Link href={target} className={`chip ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
      </Link>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Njerëzit</h1>
          <div className="sub">
            {rows.length === counts.all ? `${counts.all} veta` : `${rows.length} nga ${counts.all} veta`} — secili një herë.
            “Llogari” do të thotë që personi kyçet dhe mban faturat; “Publik” do të thotë që shfaqet te <em>Ekipi</em>{" "}
            dhe mund të zgjidhet në stërvitje.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEditRoster && <Link className="btn btn-ghost" href="/admin/team-members/new">+ Person i ri në ekip</Link>}
        </div>
      </div>

      {canManageAccounts ? <div style={{ marginBottom: 16 }}><AddMember /></div> : null}

      <div className="filter-bar">
        {chip("Të gjithë", href({ view: "all" }), counts.all, view === "all")}
        {chip("Pa llogari", href({ view: "no-account" }), counts.noAccount, view === "no-account")}
        {chip("Pa ekip", href({ view: "no-roster" }), counts.noRoster, view === "no-roster")}
        {chip("Ish-anëtarë", href({ view: "past" }), counts.past, view === "past")}
        <div className="spacer" />
        <form method="get" action="/admin/people" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
          <input type="search" name="q" defaultValue={q} placeholder="Kërko sipas emrit…" aria-label="Kërko person" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
          <button type="submit" className="btn btn-sm">Kërko</button>
          {q && <Link className="btn btn-ghost btn-sm" href={href({ q: "" })}>Pastro</Link>}
        </form>
      </div>

      <div className="filter-bar">
        <span className="meta">Roli</span>
        {chip("Të gjithë", href({ role: null }), withAccount, roleFilter === null)}
        {ROLES.map(r => (
          <span key={r}>{chip(ROLE_LABEL[r], href({ role: r }), roleCounts[r] ?? 0, roleFilter === r)}</span>
        ))}
      </div>

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Personi</th>
              <th>Seksioni</th>
              <th>Llogari</th>
              <th>Publik</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Asnjë person në këtë filtër.</td></tr>
            ) : rows.map(p => {
              const tm = p.roster[0] ?? null;
              const acc = p.account;
              const sec = (tm?.section_slug ? sectionBySlug.get(tm.section_slug) : null)
                ?? (acc?.section_id ? sectionById.get(acc.section_id) : null)
                ?? null;
              const photo = tm?.photo?.storage_path ?? null;
              return (
                <tr key={p.key}>
                  <td>
                    <div className="person">
                      {photo
                        ? <img className="avatar" src={`${SUPA}/storage/v1/object/public/media/${photo}`} alt="" style={{ objectFit: "cover" }} />
                        : <div className="avatar">{initials(p.name)}</div>}
                      <div className="nm">
                        {tm && canEditRoster
                          ? <Link href={`/admin/team-members/${tm.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                          : <span style={{ fontWeight: 600 }}>{p.name}</span>}
                        <small>{[acc?.email, tm?.slug].filter(Boolean).join(" · ") || "—"}</small>
                      </div>
                    </div>
                    {/* Two roster rows for one account is bad data (profile_id
                        has no unique index). The row is collapsed so the person
                        is not listed twice, but every extra row stays reachable
                        — otherwise it could never be opened or deleted again. */}
                    {p.roster.length > 1 && (
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--warn)", marginTop: 6, lineHeight: 1.7 }}>
                        {p.roster.length} rreshta ekipi për këtë llogari — mbaj njërin dhe fshij të tjerët:{" "}
                        {p.roster.slice(1).map((extra, i) => (
                          <span key={extra.id}>
                            {i > 0 ? ", " : ""}
                            {canEditRoster
                              ? <Link href={`/admin/team-members/${extra.id}`}>{extra.slug}</Link>
                              : extra.slug}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td data-lab="Seksioni">
                    {sec ? <span className={`tag-sec ${sec.slug}`}>{sec.name_sq}</span> : "—"}
                  </td>

                  <td data-lab="Llogari">
                    {acc ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {canManageAccounts
                          ? <RolePicker id={acc.id} current={acc.role} name={p.name} />
                          : <span className="mono">{ROLE_LABEL[acc.role] ?? acc.role}</span>}
                        <span className={`badge-st ${acc.status === "active" ? "ok" : acc.status === "pending" ? "warn" : "err"}`}>
                          {STATUS_LABEL[acc.status] ?? acc.status}
                        </span>
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                          {acc.joined_at
                            ? `U bashkua ${new Date(acc.joined_at).toLocaleDateString("sq", { month: "short", year: "numeric" })}`
                            : "Pa datë bashkimi"}
                        </span>
                      </div>
                    ) : (
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>Pa llogari</span>
                    )}
                  </td>

                  <td data-lab="Publik">
                    {tm ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className={`badge-st ${tm.status === "active" ? "ok" : "neutral"}`}>
                          {tm.status === "active" ? "Në ekip" : "Ish-anëtar"}
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {tm.positions.map(x => POSITION_LABEL[x] ?? x).join(" · ")} · renditja {tm.display_order}
                        </span>
                      </div>
                    ) : (
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>Pa ekip</span>
                    )}
                  </td>

                  <td className="actions">
                    {tm && canEditRoster && (
                      <Link className="btn btn-ghost btn-sm" href={`/admin/team-members/${tm.id}`}>Ndrysho</Link>
                    )}
                    {/* The one contextual action: the facet this person is missing. */}
                    {!acc && tm && canManageAccounts && <CreateAccount teamMemberId={tm.id} name={p.name} />}
                    {acc && !tm && canEditRoster && <AddToRoster profileId={acc.id} name={p.name} role={acc.role} />}
                    {tm && canEditRoster && <DeleteButton id={tm.id} name={tm.full_name} />}
                    {acc && canManageAccounts && (
                      <ManageMember id={acc.id} name={p.name} email={acc.email} status={acc.status} isSelf={acc.id === user.id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
