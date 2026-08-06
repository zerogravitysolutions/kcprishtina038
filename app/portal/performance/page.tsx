import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { ColumnChart, LineChart } from "../../admin/training/charts";
import { computeBests, weeklyVolume, wPerKg, fmt, type EntryLike } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EntryRow = EntryLike & { ride: { ride_date: string } | null };

const CARD = { background: "var(--white, #fff)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 12, padding: 18 } as const;

export default async function PortalPerformancePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: athleteRows } = await supabase
    .from("team_members")
    .select("id, full_name")
    .eq("profile_id", profile.id)
    .limit(1);
  const athlete = (athleteRows as { id: string; full_name: string }[] | null)?.[0] ?? null;

  const [{ data: profileData }, { data: entryData }] = athlete
    ? await Promise.all([
        supabase.from("athlete_profiles").select("ftp_w, weight_kg, max_hr, resting_hr").eq("athlete_id", athlete.id).maybeSingle(),
        supabase
          .from("ride_entries")
          .select("participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, ride:training_rides(ride_date)")
          .eq("athlete_id", athlete.id),
      ])
    : [{ data: null }, { data: null }];

  const prof = (profileData as { ftp_w: number | null; weight_kg: number | null; max_hr: number | null; resting_hr: number | null } | null) ?? null;
  const entries = (entryData as unknown as EntryRow[] | null) ?? [];
  const bests = computeBests(entries);
  const wkg = wPerKg(prof?.ftp_w ?? null, prof?.weight_kg ?? null);

  const volume = weeklyVolume(
    entries.map((e) => ({ ride_date: e.ride?.ride_date ?? "", distance_km: e.distance_km, moving_seconds: e.moving_seconds, participated: e.participated })),
    12,
  ).map((w) => ({ label: w.label, value: w.km, display: `${w.km}` }));

  const powerPts = entries
    .filter((e) => e.best_power_20m_w != null && e.ride?.ride_date)
    .slice()
    .sort((a, b) => (a.ride!.ride_date).localeCompare(b.ride!.ride_date))
    .map((e) => ({ label: new Date(e.ride!.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short" }), value: e.best_power_20m_w as number, display: `${e.best_power_20m_w} W` }));

  const curve: { label: string; w: number | null }[] = [
    { label: "1 min", w: bests.best_power_1m_w },
    { label: "3 min", w: bests.best_power_3m_w },
    { label: "5 min", w: bests.best_power_5m_w },
    { label: "10 min", w: bests.best_power_10m_w },
    { label: "20 min", w: bests.best_power_20m_w },
    { label: "60 min", w: bests.best_power_60m_w },
  ];

  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, letterSpacing: "-0.03em", margin: 0 }}>Performanca</h1>
      <div className="sub" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".06em", color: "var(--ink-3)" }}>
        FTP-ja, rekordet dhe progresi yt.
      </div>

      {!athlete ? (
        <div style={{ ...CARD, marginTop: 24, color: "var(--ink-3)", fontSize: 14 }}>
          Nuk je i lidhur ende si çiklist. Kontakto trajnerin që të lidhë llogarinë tënde.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
          {/* Baseline tiles */}
          <div style={{ ...CARD, display: "flex", gap: 24, flexWrap: "wrap", padding: "16px 20px" }}>
            <Stat label="FTP" value={prof?.ftp_w ? `${prof.ftp_w} W` : "—"} sub={wkg != null ? `${wkg} W/kg` : undefined} />
            <Stat label="Pesha" value={prof?.weight_kg ? `${prof.weight_kg} kg` : "—"} />
            <Stat label="HR max" value={prof?.max_hr ? String(prof.max_hr) : (bests.max_hr ? String(bests.max_hr) : "—")} />
            <Stat label="Stërvitje" value={String(bests.rides)} />
            <Stat label="KM total" value={bests.total_km > 0 ? fmt(bests.total_km, 0) : "—"} />
          </div>

          {/* Power curve */}
          <div style={CARD}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: "0 0 12px" }}>Rekordet e fuqisë</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
              {curve.map((p) => (
                <div key={p.label} style={{ padding: "10px 12px", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 8, textAlign: "center" }}>
                  <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)" }}>{p.label}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginTop: 4 }}>{p.w ?? "—"}<span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400 }}>{p.w ? " W" : ""}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div style={CARD}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>Volumi javor <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)" }}>· km · 12 javë</span></h3>
              <ColumnChart data={volume} />
            </div>
            <div style={CARD}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>Fuqia 20-min <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)" }}>· W</span></h3>
              {powerPts.length >= 2
                ? <LineChart data={powerPts} />
                : <p className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", padding: "28px 0", textAlign: "center" }}>Duhen së paku 2 stërvitje me fuqi 20-min.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub ? <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{sub}</div> : null}
    </div>
  );
}
