import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApplicationActions } from "./ApplicationActions";

type Row = { id: string; full_name: string; email: string; status: string; experience: string | null; created_at: string; section: { name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

export default async function ApplicationsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","staff"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("applications")
    .select("id, full_name, email, status, experience, created_at, section:sections(name_sq)")
    .order("created_at", { ascending: false }).limit(100);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Applications</h1>
          <div className="sub">{rows.length} në bazë</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Section</th><th>Experience</th><th>Status</th><th>Received</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka aplikime.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td><div className="person"><div className="avatar">{initials(r.full_name)}</div><div className="nm">{r.full_name}<small>{r.email}</small></div></div></td>
                  <td>{r.section?.name_sq ?? "—"}</td>
                  <td className="mono">{r.experience ?? "—"}</td>
                  <td><span className={`badge-st ${r.status === "pending" ? "warn" : r.status === "approved" ? "ok" : "err"}`}>{r.status}</span></td>
                  <td className="mono">{new Date(r.created_at).toLocaleDateString("sq")}</td>
                  <td className="actions"><ApplicationActions id={r.id} name={r.full_name} status={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
