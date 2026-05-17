import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; title_sq: string; type: string; status: string; start_at: string; location: string | null; section: { name_sq: string } | null };

export default async function EventsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("events")
    .select("id, title_sq, type, status, start_at, location, section:sections(name_sq)")
    .order("start_at", { ascending: false }).limit(100);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Events</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Title</th><th>Type</th><th>Section</th><th>Start</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka eventet.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.title_sq}<small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".06em", marginTop: 2 }}>{r.location ?? "—"}</small></td>
                  <td className="mono">{r.type}</td>
                  <td>{r.section?.name_sq ?? "—"}</td>
                  <td className="mono">{new Date(r.start_at).toLocaleDateString("sq")}</td>
                  <td><span className={`badge-st ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "err"}`}>{r.status}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
