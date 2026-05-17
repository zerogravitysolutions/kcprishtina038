import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; slug: string; display_order: number; name_sq: string; name_en: string; active: boolean; coach: { full_name: string } | null };

export default async function SectionsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("sections")
    .select("id, slug, display_order, name_sq, name_en, active, coach:coach_id(full_name)")
    .order("display_order");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Sections</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Slug</th><th>Coach</th><th>Order</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><span className={`tag-sec ${r.slug}`}>{r.name_sq}</span></td>
                <td className="mono">{r.slug}</td>
                <td>{r.coach?.full_name ?? "—"}</td>
                <td className="mono">{r.display_order}</td>
                <td><span className={`badge-st ${r.active ? "ok" : "err"}`}>{r.active ? "active" : "inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
