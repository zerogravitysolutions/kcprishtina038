import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import {
  getDocuments, categoryLabel, documentUrl, formatBytes,
  type DocumentRow,
} from "@/lib/supabase/documents";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { UploadForm } from "./UploadForm";
import { RowActions } from "./RowActions";

export const metadata = { title: "Dokumentet" };

export default async function DocumentsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "editor"].includes(profile.role)) redirect("/admin/dashboard");

  const rows: DocumentRow[] = await getDocuments();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dokumentet</h1>
          <div className="sub">{rows.length} në bazë · PDF vetëm</div>
        </div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 12 }}>
          Ngarko dokument të ri
        </h2>
        <UploadForm />
      </section>

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Titulli</th>
              <th>Kategoria</th>
              <th>Dukshmëria</th>
              <th>Madhësia</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Asnjë dokument — ngarko të parin më lart.</td></tr>
              : rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{d.title}</span>
                    <small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".06em", marginTop: 2 }}>/{d.slug}</small>
                  </td>
                  <td className="mono">{categoryLabel(d.category)}</td>
                  <td>
                    <span className={`badge-st ${d.visibility === "public" ? "ok" : d.visibility === "members" ? "warn" : "err"}`}>
                      {d.visibility}
                    </span>
                  </td>
                  <td className="mono num">{formatBytes(d.byte_size)}</td>
                  <td className="mono">
                    {d.effective_date
                      ? new Date(d.effective_date).toLocaleDateString("sq")
                      : new Date(d.created_at).toLocaleDateString("sq")}
                  </td>
                  <td className="actions">
                    <RowActions
                      id={d.id}
                      title={d.title}
                      slug={d.slug}
                      storagePath={d.storage_path}
                      fileUrl={documentUrl(d)}
                      category={d.category}
                      visibility={d.visibility}
                      description={d.description}
                      effectiveDate={d.effective_date}
                      displayOrder={d.display_order}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
