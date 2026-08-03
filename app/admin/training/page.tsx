import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { fmt, sum } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type EntryLite = { participated: boolean; distance_km: number | null };
type RideRow = {
  id: string;
  ride_date: string;
  title: string | null;
  focus: string | null;
  location: string | null;
  section: { slug: string; name_sq: string } | null;
  entries: EntryLite[];
};

export default async function TrainingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("training_rides")
    .select("id, ride_date, title, focus, location, section:sections!section_id(slug, name_sq), entries:ride_entries(participated, distance_km)")
    .order("ride_date", { ascending: false })
    .limit(80);
  const rows = (data as unknown as RideRow[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stërvitjet</h1>
          <div className="sub">Regjistro stërvitjet — zgjidh 1 ose më shumë çiklistë për secilën.</div>
        </div>
        <Link className="btn btn-ember" href="/admin/training/new">+ Stërvitje e re</Link>
      </div>

      <div className="filter-bar" style={{ borderRadius: 12, border: "1px solid var(--line)", marginBottom: 12 }}>
        <span className="meta">{rows.length} stërvitje</span>
        <div className="spacer" />
        <Link className="meta" href="/admin/training/progress" style={{ color: "var(--ember-deep)" }}>Progresi mujor →</Link>
      </div>

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Data</th>
              <th>Stërvitja</th>
              <th>Seksioni</th>
              <th>Çiklistë</th>
              <th>KM</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Ende asnjë stërvitje. Fillo me “+ Stërvitje e re”.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const parts = r.entries.filter((e) => e.participated).length;
                const km = sum(r.entries.map((e) => e.distance_km));
                const dateLabel = new Date(r.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short", year: "numeric" });
                return (
                  <tr key={r.id}>
                    <td className="mono">{dateLabel}</td>
                    <td>
                      <Link href={`/admin/training/${r.id}`} style={{ fontWeight: 600 }}>
                        {r.title || r.focus || "Stërvitje"}
                      </Link>
                      {(r.focus && r.title) || r.location ? (
                        <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {r.focus && r.title ? <small className="mono" style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.focus}</small> : null}
                          {r.location ? <small className="mono" style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.focus && r.title ? "· " : ""}{r.location}</small> : null}
                        </div>
                      ) : null}
                    </td>
                    <td>{r.section ? <span className={`tag-sec ${r.section.slug}`}>{r.section.name_sq}</span> : "—"}</td>
                    <td className="mono">{parts}</td>
                    <td className="mono">{km > 0 ? fmt(km, 1) : "—"}</td>
                    <td className="actions">
                      <Link className="btn btn-ghost btn-sm" href={`/admin/training/${r.id}`}>Hap</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
