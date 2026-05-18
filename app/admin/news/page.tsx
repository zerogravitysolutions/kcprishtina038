import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  slug: string;
  title_sq: string;
  status: string;
  source: string | null;
  updated_at: string;
  author: { full_name: string } | null;
};

export default async function NewsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("news")
    .select("id, slug, title_sq, status, source, updated_at, author:profiles!author_id(full_name)")
    .order("updated_at", { ascending: false }).limit(200);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>News</h1>
          <div className="sub">{rows.length} në bazë</div>
        </div>
        <Link className="btn btn-ember" href="/admin/news/new">+ Artikull i ri</Link>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Title</th><th>Source</th><th>Author</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka artikuj — krijoni një draft.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/news/${r.id}`} style={{ fontWeight: 600 }}>{r.title_sq}</Link>
                    <small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".06em", marginTop: 2 }}>/{r.slug}</small>
                  </td>
                  <td className="mono" style={{ textTransform: "uppercase", fontSize: 10.5, letterSpacing: ".1em" }}>{r.source ?? "manual"}</td>
                  <td>{r.author?.full_name ?? "—"}</td>
                  <td><span className={`badge-st ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "err"}`}>{r.status}</span></td>
                  <td className="mono">{new Date(r.updated_at).toLocaleDateString("sq")}</td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/news/${r.id}`}>Edit</Link>
                    <DeleteButton id={r.id} title={r.title_sq} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
