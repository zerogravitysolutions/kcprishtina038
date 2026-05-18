import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; name: string; tier: string; role_sq: string | null; website_url: string | null; contract_end: string | null; active: boolean };

export default async function SponsorsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("sponsors")
    .select("id, name, tier, role_sq, website_url, contract_end, active").order("display_order");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div><h1>Sponsors</h1><div className="sub">{rows.length} në bazë</div></div>
        <Link className="btn btn-ember" href="/admin/sponsors/new">+ Sponsor i ri</Link>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Tier</th><th>Role</th><th>Website</th><th>Contract end</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={7} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka sponsorë — shtoni një.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td><Link href={`/admin/sponsors/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link></td>
                  <td><span className="badge-st">{r.tier}</span></td>
                  <td>{r.role_sq ?? "—"}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{r.website_url ? <a href={r.website_url} target="_blank" rel="noopener">{r.website_url.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                  <td className="mono">{r.contract_end ? new Date(r.contract_end).toLocaleDateString("sq") : "—"}</td>
                  <td><span className={`badge-st ${r.active ? "ok" : "err"}`}>{r.active ? "active" : "inactive"}</span></td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/sponsors/${r.id}`}>Edit</Link>
                    <DeleteButton id={r.id} name={r.name} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
