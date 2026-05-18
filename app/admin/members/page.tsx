import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RolePicker } from "../staff/RolePicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; full_name: string; email: string; role: string; status: string; joined_at: string | null; section: { slug: string; name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

export default async function MembersPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const canChangeRole = profile.role === "admin";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles")
    .select("id, full_name, email, role, status, joined_at, section:sections(slug, name_sq)")
    .order("joined_at", { ascending: false, nullsFirst: false }).limit(500);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <div className="sub">{rows.length} në bazë · admin mund të ndryshojë rolin direkt këtu</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Rider</th><th>Section</th><th>Role</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka anëtarë.</td></tr>
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
