import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RolePicker } from "./RolePicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; full_name: string; email: string; role: string; status: string; section: { name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

export default async function StaffPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles")
    .select("id, full_name, email, role, status, section:sections!section_id(name_sq)")
    .in("role", ["admin", "editor", "staff", "coach"])
    .order("role");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Staff & coaches</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Role</th><th>Section</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={4} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka staf të caktuar.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td><div className="person"><div className="avatar">{initials(r.full_name)}</div><div className="nm">{r.full_name}<small>{r.email}</small></div></div></td>
                  <td><RolePicker id={r.id} current={r.role} name={r.full_name} /></td>
                  <td>{r.section?.name_sq ?? "—"}</td>
                  <td><span className={`badge-st ${r.status === "active" ? "ok" : "warn"}`}>{r.status}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
