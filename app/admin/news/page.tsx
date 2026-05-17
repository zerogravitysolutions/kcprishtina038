import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; slug: string; title_sq: string; status: string; updated_at: string; author: { full_name: string } | null };

export default async function NewsAdminPage() {
  const profile = (await getProfile())!;
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("news")
    .select("id, slug, title_sq, status, updated_at, author:profiles!author_id(full_name)")
    .order("updated_at", { ascending: false }).limit(100);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>News</h1><div className="sub">{rows.length} në bazë</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={4} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka artikuj — krijoni një draft.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.title_sq}<small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".06em", marginTop: 2 }}>/{r.slug}</small></td>
                  <td>{r.author?.full_name ?? "—"}</td>
                  <td><span className={`badge-st ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "err"}`}>{r.status}</span></td>
                  <td className="mono">{new Date(r.updated_at).toLocaleDateString("sq")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
