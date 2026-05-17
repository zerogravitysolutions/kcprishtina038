import Link from "next/link";
import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type AppRow = { id: string; full_name: string; email: string; experience: string | null; created_at: string; section: { slug: string; name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }
function rel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "tani";
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + " min";
  if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + "h";
  return Math.floor(ms / 86_400_000) + "d";
}

export default async function AdminDashboard() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10);

  const [membersC, appsC, duesData, apps] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("dues").select("status").gte("period", monthStart).lt("period", monthEnd),
    supabase.from("applications").select("id, full_name, email, experience, created_at, section:sections(slug, name_sq)").eq("status", "pending").order("created_at", { ascending: false }).limit(4),
  ]);

  const duesRows = (duesData.data as { status: string }[] | null) ?? [];
  const paid = duesRows.filter(d => d.status === "paid").length;
  const appList = (apps.data as AppRow[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Përshëndetje, {profile.full_name.split(" ")[0]}.</h1>
          <div className="sub mono">{new Date().toLocaleDateString("sq", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="lab">Active members</span>
          <span className="val">{membersC.count ?? 0}</span>
          <span className="delta up">{membersC.count ?? 0} aktivë në bazë</span>
        </div>
        <div className="kpi">
          <span className="lab">New applications</span>
          <span className="val">{appsC.count ?? 0}</span>
          <span className="delta">në pritje</span>
        </div>
        <div className="kpi">
          <span className="lab">Dues paid · this month</span>
          <span className="val">{paid}<span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: 18, fontWeight: 500 }}>/{duesRows.length}</span></span>
          <span className="delta">{duesRows.length === 0 ? "—" : `${duesRows.length - paid} pa paguar`}</span>
        </div>
        <div className="kpi">
          <span className="lab">YTD revenue</span>
          <span className="val mono">€ —</span>
          <span className="delta">aggregate në v2</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <h3>Latest applications</h3>
          <Link href="/admin/applications">See all →</Link>
        </div>
        <table className="t">
          <thead><tr><th>Name</th><th>Section</th><th>Experience</th><th>Received</th><th></th></tr></thead>
          <tbody>
            {appList.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka aplikime në pritje.</td></tr>
            ) : appList.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="person">
                    <div className="avatar">{initials(a.full_name)}</div>
                    <div className="nm">{a.full_name}<small>{a.email}</small></div>
                  </div>
                </td>
                <td>{a.section ? <span className={`tag-sec ${a.section.slug}`}>{a.section.name_sq}</span> : "—"}</td>
                <td className="mono">{a.experience ?? "—"}</td>
                <td className="mono">{rel(a.created_at)}</td>
                <td className="right">
                  <Link className="btn btn-sm btn-ember" href="/admin/applications">Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
