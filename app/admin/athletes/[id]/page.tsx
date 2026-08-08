import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { AthleteProfileForm, type ProfileInitial } from "./AthleteProfileForm";
import { ColumnChart, LineChart } from "../../training/charts";
import { computeBests, fmt, toHours, formatDurationShort, weeklyVolume, type EntryLike } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type Athlete = { id: string; full_name: string; section_slug: string | null; dob: string | null; gender: "m" | "f" | null };

type EntryRow = EntryLike & {
  id: string;
  np_w: number | null;
  tss: number | null;
  rpe: number | null;
  ride: { id: string; ride_date: string; focus: string | null } | null;
};

export default async function AthleteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: athleteData }, { data: profileData }, { data: entryData }] = await Promise.all([
    supabase.from("team_members").select("id, full_name, section_slug, dob, gender").eq("id", id).maybeSingle(),
    supabase.from("athlete_profiles").select("ftp_w, ftp_updated_at, weight_kg, max_hr, resting_hr, notes").eq("athlete_id", id).maybeSingle(),
    supabase
      .from("ride_entries")
      .select("id, participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, np_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, tss, rpe, ride:training_rides(id, ride_date, focus)")
      .eq("athlete_id", id),
  ]);

  const athlete = athleteData as Athlete | null;
  if (!athlete) notFound();
  const prof = (profileData as ProfileInitial | null) ?? { ftp_w: null, ftp_updated_at: null, weight_kg: null, max_hr: null, resting_hr: null, notes: null };
  const entries = (entryData as unknown as EntryRow[] | null) ?? [];
  const bests = computeBests(entries);

  const recent = entries
    .slice()
    .sort((a, b) => (b.ride?.ride_date ?? "").localeCompare(a.ride?.ride_date ?? ""))
    .slice(0, 20);

  const volumeData = weeklyVolume(
    entries.map((e) => ({ ride_date: e.ride?.ride_date ?? "", distance_km: e.distance_km, moving_seconds: e.moving_seconds, participated: e.participated })),
    12,
  ).map((w) => ({ label: w.label, value: w.km, display: `${w.km}` }));

  const powerPts = entries
    .filter((e) => e.best_power_20m_w != null && e.ride?.ride_date)
    .slice()
    .sort((a, b) => (a.ride!.ride_date).localeCompare(b.ride!.ride_date))
    .map((e) => ({
      label: new Date(e.ride!.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short" }),
      value: e.best_power_20m_w as number,
      display: `${e.best_power_20m_w} W`,
    }));

  const powerCurve: { label: string; w: number | null }[] = [
    { label: "1 min", w: bests.best_power_1m_w },
    { label: "3 min", w: bests.best_power_3m_w },
    { label: "5 min", w: bests.best_power_5m_w },
    { label: "10 min", w: bests.best_power_10m_w },
    { label: "20 min", w: bests.best_power_20m_w },
    { label: "60 min", w: bests.best_power_60m_w },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{athlete.full_name}</h1>
          <div className="sub">{athlete.section_slug ?? "Çiklist"} · profili i performancës</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/training/progress">← Progresi</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 20, alignItems: "start" }} className="athlete-cols">
        <AthleteProfileForm athleteId={athlete.id} initial={prof} />

        <div style={{ display: "grid", gap: 16 }}>
          {/* Totals */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "14px 16px", background: "var(--paper-2)", borderRadius: 10 }}>
            <Stat label="Stërvitje" value={String(bests.rides)} />
            <Stat label="KM gjithsej" value={bests.total_km > 0 ? fmt(bests.total_km, 0) : "—"} />
            <Stat label="Orë gjithsej" value={bests.total_seconds > 0 ? fmt(toHours(bests.total_seconds), 1) : "—"} />
            <Stat label="HR max" value={bests.max_hr ? String(bests.max_hr) : "—"} />
          </div>

          {/* Power curve */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-head" style={{ marginBottom: 12 }}><h3>Rekordet e fuqisë</h3><span className="kicker">të gjitha kohërat</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
              {powerCurve.map((p) => (
                <div key={p.label} style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, textAlign: "center" }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)" }}>{p.label}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginTop: 4 }}>{p.w ?? "—"}<span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400 }}>{p.w ? " W" : ""}</span></div>
                </div>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <span>Stërvitja më e gjatë: <strong style={{ color: "var(--ink)" }}>{bests.longest_km ? `${fmt(bests.longest_km, 1)} km` : "—"}</strong></span>
              <span>Ngjitja më e madhe: <strong style={{ color: "var(--ink)" }}>{bests.most_elevation_m ? `${fmt(bests.most_elevation_m, 0)} m` : "—"}</strong></span>
              <span>Fuqia mes. më e mirë: <strong style={{ color: "var(--ink)" }}>{bests.best_avg_power_w ? `${bests.best_avg_power_w} W` : "—"}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Monitoring charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="card-head" style={{ marginBottom: 10 }}><h3>Volumi javor</h3><span className="kicker">km · 12 javë</span></div>
          <ColumnChart data={volumeData} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="card-head" style={{ marginBottom: 10 }}><h3>Fuqia 20-min</h3><span className="kicker">W · sipas stërvitjes</span></div>
          {powerPts.length >= 2
            ? <LineChart data={powerPts} />
            : <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: "28px 0", textAlign: "center" }}>Duhen së paku 2 stërvitje me fuqi 20-min për këtë grafik.</p>}
        </div>
      </div>

      {/* Recent rides */}
      <h2 className="display" style={{ fontSize: 18, letterSpacing: "-0.015em", margin: "26px 0 10px" }}>Stërvitjet e fundit</h2>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr><th>Data</th><th>Stërvitja</th><th>KM</th><th>Koha</th><th>HR mes.</th><th>FTP</th><th>10 min</th><th>RPE</th></tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Ende asnjë stërvitje e regjistruar.</td></tr>
            ) : (
              recent.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.ride ? new Date(e.ride.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</td>
                  <td>{e.ride ? <Link href={`/admin/training/${e.ride.id}`} style={{ fontWeight: 600 }}>{e.ride.focus || "Stërvitje"}</Link> : "—"}</td>
                  <td className="mono">{e.distance_km != null ? fmt(e.distance_km, 1) : "—"}</td>
                  <td className="mono">{formatDurationShort(e.moving_seconds)}</td>
                  <td className="mono">{e.avg_hr ?? "—"}</td>
                  <td className="mono">{e.ftp_w ?? "—"}</td>
                  <td className="mono">{e.best_power_10m_w ?? "—"}</td>
                  <td className="mono">{e.rpe ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
