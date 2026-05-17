import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; position: number | null; event: { title_sq: string; start_at: string } | null; member: { full_name: string } | null; rider_name_override: string | null; category: { name: string } | null };

export default async function ResultsAdminPage() {
  const profile = (await getProfile())!;
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("results")
    .select("id, position, event:events(title_sq, start_at), member:profiles(full_name), rider_name_override, category:event_categories(name)")
    .order("created_at", { ascending: false }).limit(100);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Results</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th style={{ width: 50 }}>Pos.</th><th>Event</th><th>Rider</th><th>Category</th><th>Date</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka rezultate.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 18 }}>{r.position ? String(r.position).padStart(2, "0") : "—"}</td>
                  <td>{r.event?.title_sq ?? "—"}</td>
                  <td>{r.member?.full_name ?? r.rider_name_override ?? "—"}</td>
                  <td className="mono">{r.category?.name ?? "—"}</td>
                  <td className="mono">{r.event?.start_at ? new Date(r.event.start_at).toLocaleDateString("sq") : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
