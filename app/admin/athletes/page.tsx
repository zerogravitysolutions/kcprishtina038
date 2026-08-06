import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { computeBests, fmt, wPerKg, type EntryLike } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type AthleteRow = {
  id: string;
  full_name: string;
  section_slug: string | null;
  profile: { ftp_w: number | null; weight_kg: number | null } | null;
};

type EntryWithDate = EntryLike & { ride: { ride_date: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?"; }

export default async function AthletesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const supabase = await createClient();
  const [{ data: athleteRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, full_name, section_slug, profile:athlete_profiles(ftp_w, weight_kg)")
      .eq("status", "active")
      .contains("positions", ["rider"])
      .order("full_name"),
    supabase
      .from("ride_entries")
      .select("athlete_id, participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, ride:training_rides(ride_date)"),
  ]);

  const athletes = (athleteRows as unknown as AthleteRow[] | null) ?? [];
  const entries = (entryRows as unknown as EntryWithDate[] | null) ?? [];

  const byAthlete = new Map<string, EntryWithDate[]>();
  for (const e of entries) {
    if (!byAthlete.has(e.athlete_id)) byAthlete.set(e.athlete_id, []);
    byAthlete.get(e.athlete_id)!.push(e);
  }

  const rows = athletes.map((a) => {
    const list = byAthlete.get(a.id) ?? [];
    const bests = computeBests(list);
    let last: string | null = null;
    for (const e of list) {
      const d = e.ride?.ride_date ?? null;
      if (d && (!last || d > last)) last = d;
    }
    return { a, bests, last };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Çiklistët</h1>
          <div className="sub">Profili i secilit — FTP-ja aktuale dhe rekordet, që përditësohen me çdo stërvitje.</div>
        </div>
        <Link className="btn btn-ghost" href="/admin/training/progress">Progresi mujor →</Link>
      </div>

      <div className="table-wrap">
        <table className="t ex-table">
          <thead>
            <tr>
              <th>Çiklisti</th>
              <th>FTP</th>
              <th>5 min</th>
              <th>10 min</th>
              <th>20 min</th>
              <th>Stërvitje</th>
              <th>KM total</th>
              <th>Fundit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                Nuk ka çiklistë. Shtoji te <Link href="/admin/team-members" style={{ color: "var(--ember)" }}>Ekipi</Link>.
              </td></tr>
            ) : (
              rows.map(({ a, bests, last }) => {
                const wkg = wPerKg(a.profile?.ftp_w ?? null, a.profile?.weight_kg ?? null);
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="person">
                        <div className="avatar">{initials(a.full_name)}</div>
                        <div className="nm">
                          <Link href={`/admin/athletes/${a.id}`} style={{ fontWeight: 600 }}>{a.full_name}</Link>
                          {a.section_slug ? <small>{a.section_slug}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td className="mono" data-label="FTP">
                      {a.profile?.ftp_w ? <>{a.profile.ftp_w} W{wkg != null ? <small style={{ color: "var(--ink-3)", fontSize: 10.5 }}> · {wkg} W/kg</small> : null}</> : "—"}
                    </td>
                    <td className="mono" data-label="5 min">{bests.best_power_5m_w ? `${bests.best_power_5m_w} W` : "—"}</td>
                    <td className="mono" data-label="10 min">{bests.best_power_10m_w ? `${bests.best_power_10m_w} W` : "—"}</td>
                    <td className="mono" data-label="20 min">{bests.best_power_20m_w ? `${bests.best_power_20m_w} W` : "—"}</td>
                    <td className="mono" data-label="Stërvitje">{bests.rides}</td>
                    <td className="mono" data-label="KM total">{bests.total_km > 0 ? fmt(bests.total_km, 0) : "—"}</td>
                    <td className="mono" data-label="Fundit">{last ? new Date(last + "T00:00:00").toLocaleDateString("sq", { day: "2-digit", month: "short" }) : "—"}</td>
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
