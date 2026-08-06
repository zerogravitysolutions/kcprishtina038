import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { computeBests, fmt, toHours, formatDurationShort, type EntryLike } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EntryRow = EntryLike & {
  id: string;
  rpe: number | null;
  ride: { id: string; ride_date: string; title: string | null; focus: string | null } | null;
};

export default async function PortalTrainingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: athleteRows } = await supabase
    .from("team_members")
    .select("id, full_name")
    .eq("profile_id", profile.id)
    .limit(1);
  const athlete = (athleteRows as { id: string; full_name: string }[] | null)?.[0] ?? null;

  const entries = athlete
    ? (((await supabase
        .from("ride_entries")
        .select("id, participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, rpe, ride:training_rides(id, ride_date, title, focus)")
        .eq("athlete_id", athlete.id)).data) as unknown as EntryRow[] | null) ?? []
    : [];

  const rides = entries
    .slice()
    .sort((a, b) => (b.ride?.ride_date ?? "").localeCompare(a.ride?.ride_date ?? ""));
  const bests = computeBests(entries);

  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, letterSpacing: "-0.03em", margin: 0 }}>Stërvitjet e mia</h1>
      <div className="sub" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".06em", color: "var(--ink-3)" }}>
        Historiku i stërvitjeve të regjistruara nga trajneri.
      </div>

      {!athlete ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "22px 0", padding: "16px 20px", background: "var(--white, #fff)", border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)", borderRadius: 16, boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)" }}>
            <Stat label="Stërvitje" value={String(bests.rides)} />
            {bests.total_km > 0 ? <Stat label="KM total" value={fmt(bests.total_km, 0)} /> : null}
            {bests.total_seconds > 0 ? <Stat label="Orë total" value={fmt(toHours(bests.total_seconds), 1)} /> : null}
            {bests.max_hr ? <Stat label="HR max" value={String(bests.max_hr)} /> : null}
          </div>

          {rides.length === 0 ? (
            <p style={{ color: "var(--ink-3)", marginTop: 20 }}>Ende asnjë stërvitje e regjistruar.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {rides.map((e) => {
                const metrics = [
                  e.distance_km != null && e.distance_km > 0 ? { l: "km", v: fmt(e.distance_km, 1) } : null,
                  e.moving_seconds != null && e.moving_seconds > 0 ? { l: "kohë", v: formatDurationShort(e.moving_seconds) } : null,
                  e.avg_hr != null ? { l: "HR mes", v: String(e.avg_hr) } : null,
                  e.ftp_w != null ? { l: "FTP", v: `${e.ftp_w} W` } : null,
                  e.best_power_10m_w != null ? { l: "10 min", v: `${e.best_power_10m_w} W` } : null,
                  e.rpe != null ? { l: "RPE", v: String(e.rpe) } : null,
                ].filter((m): m is { l: string; v: string } => m != null);
                return (
                  <div key={e.id} style={{ background: "var(--white, #fff)", border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)", borderRadius: 16, padding: "15px 17px", boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <strong style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700, letterSpacing: "-.012em", lineHeight: 1.2 }}>{e.ride?.title || e.ride?.focus || "Stërvitje"}</strong>
                      {e.ride ? (
                        <span className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3, #2a3858)", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {new Date(e.ride.ride_date + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short" })}
                        </span>
                      ) : null}
                    </div>
                    {metrics.length > 0 ? (
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 13 }}>
                        {metrics.map((m) => <Pill key={m.l} label={m.l} value={m.v} />)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div style={{ marginTop: 24, padding: 20, background: "var(--white, #fff)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 16, boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)", color: "var(--ink-3)", fontSize: 14 }}>
      Nuk je i lidhur ende si çiklist. Kontakto trajnerin që të lidhë llogarinë tënde me profilin e çiklistit.
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "5px 11px", borderRadius: 999, background: "color-mix(in oklab, var(--ink, #0f1a2e) 4%, #fff)", border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
      <span style={{ color: "var(--ink-3, #2a3858)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</span>
      <b style={{ fontWeight: 700, color: "var(--ink, #0f1a2e)", fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>{value}</b>
    </span>
  );
}
