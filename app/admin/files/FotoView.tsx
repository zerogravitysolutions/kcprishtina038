import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { filesHref } from "./views";

type Row = { id: string; storage_path: string; filename: string; alt: string | null; byte_size: number | null; created_at: string; source: string | null };

const PAGE_SIZE = 60;

/**
 * The photo library, formerly /admin/media: a paginated read-only grid with a
 * source filter and no actions of its own. Uploading happens through
 * components/admin/MediaPicker.tsx, which every editing screen embeds.
 *
 * The gate lives on the page — this view is only ever rendered behind it.
 */
export async function FotoView({ page, src }: { page: number; src: string }) {
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
      <div className="filter-bar" aria-label="Burimi i fotove">
        <Link className={`chip ${src === "all" ? "active" : ""}`} href={filesHref("foto")}>Të gjitha</Link>
        <Link className={`chip ${src === "facebook" ? "active" : ""}`} href={filesHref("foto", { src: "facebook" })}>Facebook</Link>
        <Link className={`chip ${src === "upload" ? "active" : ""}`} href={filesHref("foto", { src: "upload" })}>Të ngarkuara</Link>
        <div className="spacer" />
        <span className="meta">{total} gjithsej · faqja {page}/{pages}</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Biblioteka është bosh për këtë filtër.
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
                  <Link className="btn btn-ghost btn-sm" href={filesHref("foto", { src, page: String(page - 1) })}>← E mëparshme</Link>
                )}
                {page < pages && (
                  <Link className="btn btn-ghost btn-sm" href={filesHref("foto", { src, page: String(page + 1) })}>E ardhshme →</Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
