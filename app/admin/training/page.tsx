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
  focus: string | null;
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
    .select("id, ride_date, focus, section:sections!section_id(slug, name_sq), entries:ride_entries(participated, distance_km)")
    .order("ride_date", { ascending: false })
    .limit(80);
  const rows = (data as unknown as RideRow[] | null) ?? [];

  const view = rows.map((r) => ({
    r,
    parts: r.entries.filter((e) => e.participated).length,
    km: sum(r.entries.map((e) => e.distance_km)),
    title: r.focus || "Stërvitje",
    dateShort: new Date(r.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short" }),
    dateLong: new Date(r.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short", year: "numeric" }),
  }));

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
        <Link className="meta" href="/admin/training/progress" style={{ color: "var(--ember)" }}>Progresi →</Link>
      </div>

      {/* Mobile: modern cards */}
      <div className="ex-cards">
        {view.length === 0 ? (
          <div className="ex-empty">Ende asnjë stërvitje. Fillo me “+ Stërvitje e re”.</div>
        ) : (
          view.map(({ r, parts, km, title, dateShort }) => (
            <Link key={r.id} href={`/admin/training/${r.id}`} className="ex-card">
              <div className="ex-card-top">
                <span className="ex-card-title">{title}</span>
                <span className="ex-card-date">{dateShort}</span>
              </div>
              {r.section && (
                <div className="ex-card-meta">
                  <span className={`tag-sec ${r.section.slug}`}>{r.section.name_sq}</span>
                </div>
              )}
              {(parts > 0 || km > 0) && (
                <div className="ex-card-stats">
                  {parts > 0 ? <span className="ex-pill"><b>{parts}</b> çiklistë</span> : null}
                  {km > 0 ? <span className="ex-pill"><b>{fmt(km, 1)}</b> km</span> : null}
                </div>
              )}
            </Link>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="ex-desktop table-wrap">
        <table className="t">
          <thead>
            <tr><th>Stërvitja</th><th>Data</th><th>Seksioni</th><th>Çiklistë</th><th>KM</th><th>Veprime</th></tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Ende asnjë stërvitje. Fillo me “+ Stërvitje e re”.</td></tr>
            ) : (
              view.map(({ r, parts, km, title, dateLong }) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/training/${r.id}`} style={{ fontWeight: 600 }}>{title}</Link>
                  </td>
                  <td className="mono">{dateLong}</td>
                  <td>{r.section ? <span className={`tag-sec ${r.section.slug}`}>{r.section.name_sq}</span> : "—"}</td>
                  <td className="mono">{parts}</td>
                  <td className="mono">{km > 0 ? fmt(km, 1) : "—"}</td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/admin/training/${r.id}`}>Hap</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
