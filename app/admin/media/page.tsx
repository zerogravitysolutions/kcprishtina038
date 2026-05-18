import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; storage_path: string; filename: string; alt: string | null; byte_size: number | null; created_at: string; source: string | null };

const PAGE_SIZE = 60;

export default async function MediaAdminPage({ searchParams }: { searchParams: Promise<{ page?: string; src?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const src = sp.src ?? "all";
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let q = supabase.from("media").select("id, storage_path, filename, alt, byte_size, created_at, source", { count: "exact" });
  if (src === "facebook" || src === "upload") q = q.eq("source", src);
  const { data, count } = await q.order("created_at", { ascending: false }).range(from, to);
  const rows = (data as Row[] | null) ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Media library</h1>
          <div className="sub">{total} skedarë · faqja {page}/{pages}</div>
        </div>
      </div>
      <div className="filter-bar" style={{ borderRadius: 12, border: "1px solid var(--line)", marginBottom: 12 }}>
        <Link className={`chip ${src === "all" ? "active" : ""}`} href="/admin/media">Të gjitha</Link>
        <Link className={`chip ${src === "facebook" ? "active" : ""}`} href="/admin/media?src=facebook">Facebook</Link>
        <Link className={`chip ${src === "upload" ? "active" : ""}`} href="/admin/media?src=upload">Manualë</Link>
        <div className="spacer" />
        <span className="meta">{total} total</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Mediateka është bosh për këtë filtër.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {rows.map(r => {
              const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${r.storage_path}`;
              return (
                <div key={r.id} style={{ background: "var(--white)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <a href={url} target="_blank" rel="noopener">
                    <img src={url} alt={r.alt ?? r.filename} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", background: "var(--paper)" }} loading="lazy" />
                  </a>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.filename}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                      <span>{Math.round((r.byte_size ?? 0) / 1024)} KB</span>
                      <span style={{ textTransform: "uppercase", letterSpacing: ".12em" }}>{r.source ?? "—"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {from + 1}–{Math.min(to + 1, total)} nga {total}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {page > 1 && (
                  <Link className="btn btn-ghost btn-sm" href={`/admin/media?${new URLSearchParams({ ...(src !== "all" ? { src } : {}), page: String(page - 1) })}`}>← I mëparshëm</Link>
                )}
                {page < pages && (
                  <Link className="btn btn-ghost btn-sm" href={`/admin/media?${new URLSearchParams({ ...(src !== "all" ? { src } : {}), page: String(page + 1) })}`}>Tjetri →</Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
