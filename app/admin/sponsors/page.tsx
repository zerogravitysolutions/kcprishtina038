import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; name: string; tier: string; role_sq: string | null; contract_end: string | null; active: boolean };

export default async function SponsorsAdminPage() {
  const profile = (await getProfile())!;
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("sponsors")
    .select("id, name, tier, role_sq, contract_end, active").order("display_order");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Sponsors</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Tier</th><th>Role</th><th>Contract end</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka sponsorë.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td><span className="badge-st">{r.tier}</span></td>
                  <td>{r.role_sq ?? "—"}</td>
                  <td className="mono">{r.contract_end ? new Date(r.contract_end).toLocaleDateString("sq") : "—"}</td>
                  <td><span className={`badge-st ${r.active ? "ok" : "err"}`}>{r.active ? "active" : "inactive"}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
