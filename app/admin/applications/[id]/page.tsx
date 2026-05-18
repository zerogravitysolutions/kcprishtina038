import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ApplicationActions } from "../ApplicationActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  age: number | null;
  experience: string | null;
  notes: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
  photo_storage_path: string | null;
  section: { name_sq: string } | null;
  reviewer: { full_name: string } | null;
};

const EXP_LABEL: Record<string, string> = {
  beginner:     "Fillestar — më pak se 1 vit",
  intermediate: "Mesatar — 1–3 vite",
  advanced:     "Garues aktiv — 3+ vite",
  racer:        "Garues",
};

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","staff"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("applications")
    .select("id, full_name, email, phone, age, experience, notes, status, reviewed_at, created_at, photo_storage_path, section:sections(name_sq), reviewer:profiles!reviewed_by(full_name)")
    .eq("id", id).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) notFound();

  // Split reviewer notes appended by reject_application from original applicant notes.
  let applicantNotes = row.notes ?? "";
  let reviewerNote: string | null = null;
  const m = applicantNotes.match(/\n\[reject reason\] (.*)$/s);
  if (m) {
    applicantNotes = applicantNotes.slice(0, m.index!).trimEnd();
    reviewerNote = m[1];
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{row.full_name}</h1>
          <div className="sub">
            Aplikoi {new Date(row.created_at).toLocaleDateString("sq", { day: "numeric", month: "long", year: "numeric" })} ·
            <span className={`badge-st ${row.status === "pending" ? "warn" : row.status === "approved" ? "ok" : "err"}`} style={{ marginLeft: 8 }}>{row.status}</span>
          </div>
        </div>
        <Link className="btn btn-ghost" href="/admin/applications">← Kthehu te lista</Link>
      </div>

      <div className="cols">
        <div className="card">
          <div className="card-head"><h3>Detajet e aplikimit</h3></div>

          {row.photo_storage_path && (
            <div style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${row.photo_storage_path}`}
                alt={`Foto profili e ${row.full_name}`}
                style={{ width: 140, height: 175, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
              />
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".12em", textTransform: "uppercase", marginTop: 6 }}>
                Foto profili<br />
                <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${row.photo_storage_path}`} target="_blank" rel="noopener" style={{ color: "var(--ember)", letterSpacing: ".06em", textTransform: "none", fontSize: 12 }}>Hape në madhësi të plotë ↗</a>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, fontSize: 14 }}>
            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Email</div>
            <div><a href={`mailto:${row.email}`} style={{ color: "var(--ember)" }}>{row.email}</a></div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Telefon</div>
            <div>{row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : <span style={{ color: "var(--ink-3)" }}>—</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Mosha</div>
            <div>{row.age ?? <span style={{ color: "var(--ink-3)" }}>—</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Seksioni</div>
            <div>{row.section?.name_sq ?? <span style={{ color: "var(--ink-3)" }}>I pavendosur</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Përvoja</div>
            <div>{row.experience ? (EXP_LABEL[row.experience] ?? row.experience) : <span style={{ color: "var(--ink-3)" }}>—</span>}</div>
          </div>

          {applicantNotes && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Shënime nga aplikuesi</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{applicantNotes}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Veprime</h3></div>
          <ApplicationActions id={row.id} name={row.full_name} status={row.status} />

          {row.status !== "pending" && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 13 }}>
              <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Rishikuar</div>
              <div>
                {row.reviewer?.full_name ?? "—"}
                {row.reviewed_at && <span style={{ color: "var(--ink-3)" }}> · {new Date(row.reviewed_at).toLocaleDateString("sq")}</span>}
              </div>
              {reviewerNote && (
                <div style={{ marginTop: 14 }}>
                  <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Arsyeja e refuzimit</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{reviewerNote}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
