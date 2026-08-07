import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RolePicker } from "./RolePicker";
import { AddMember } from "./AddMember";
import { MemberActions } from "./MemberActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; full_name: string; email: string; role: string; status: string; joined_at: string | null; section: { slug: string; name_sq: string } | null };

const ROLES = ["admin", "editor", "staff", "coach", "member"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

type SearchParams = Promise<{ role?: string }>;

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  // Build ONE client and reuse it for auth + data. Separate createClient()
  // calls don't share the refreshed session in Server Components.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileRow as { id: string; role: string; status: string } | null;
  if (!profile) redirect("/login");
  if (!["admin", "editor", "staff"].includes(profile.role)) redirect("/admin/dashboard");
  const canChangeRole = profile.role === "admin";

  const sp = await searchParams;
  const roleFilter: Role | null = (ROLES as readonly string[]).includes(sp.role ?? "")
    ? (sp.role as Role)
    : null;

  // Counts per role for the chip badges
  const { data: allForCount } = await supabase.from("profiles").select("role").limit(1000);
  const counts: Record<string, number> = { all: 0 };
  for (const r of (allForCount as { role: string }[] | null) ?? []) {
    counts.all++;
    counts[r.role] = (counts[r.role] ?? 0) + 1;
  }

  // Filtered list. Section embed is disambiguated via !section_id (sections
  // also has coach_id back to profiles).
  let q = supabase.from("profiles")
    .select("id, full_name, email, role, status, joined_at, section:sections!section_id(slug, name_sq)")
    .order("joined_at", { ascending: false, nullsFirst: false }).limit(500);
  if (roleFilter) q = q.eq("role", roleFilter);
  const { data } = await q;
  const rows = (data as Row[] | null) ?? [];

  function chip(value: Role | null, label: string) {
    const active = roleFilter === value;
    const href = value ? `/admin/members?role=${value}` : "/admin/members";
    const count = value ? (counts[value] ?? 0) : counts.all;
    return (
      <Link
        key={value ?? "all"}
        href={href}
        className={`chip ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
      </Link>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <div className="sub">
            {rows.length} {roleFilter ? `me rolin "${ROLE_LABEL[roleFilter]}"` : "në bazë"}
            {canChangeRole ? " · admin mund të shtojë, ndryshojë rolin, çaktivizojë ose fshijë" : ""}
          </div>
        </div>
      </div>
      {canChangeRole ? <div style={{ marginBottom: 16 }}><AddMember /></div> : null}
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        {chip(null, "Të gjithë")}
        {ROLES.map((r) => chip(r, ROLE_LABEL[r]))}
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Anëtari</th><th>Seksioni</th><th>Roli</th><th>U bashkua</th><th>Statusi</th>{canChangeRole ? <th>Veprime</th> : null}</tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={canChangeRole ? 6 : 5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka anëtarë në këtë filtër.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td><div className="person"><div className="avatar">{initials(r.full_name)}</div><div className="nm">{r.full_name}<small>{r.email}</small></div></div></td>
                  <td>{r.section ? <span className={`tag-sec ${r.section.slug}`}>{r.section.name_sq}</span> : "—"}</td>
                  <td>
                    {canChangeRole
                      ? <RolePicker id={r.id} current={r.role} name={r.full_name} />
                      : <span className="mono">{r.role}</span>}
                  </td>
                  <td className="mono">{r.joined_at ? new Date(r.joined_at).toLocaleDateString("sq", { month: "short", year: "numeric" }) : "—"}</td>
                  <td><span className={`badge-st ${r.status === "active" ? "ok" : r.status === "pending" ? "warn" : "err"}`}>{r.status}</span></td>
                  {canChangeRole ? <td className="actions"><MemberActions id={r.id} name={r.full_name} status={r.status} isSelf={r.id === user.id} /></td> : null}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
