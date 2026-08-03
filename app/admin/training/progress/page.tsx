import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { ProgressTable, type ProgressRow } from "./ProgressTable";
import { ColumnChart, RowBars } from "../charts";
import {
  aggregateMonthly, monthRange, monthLabel, parseMonthParam, monthParam, shiftMonth,
  weeklyVolume, fmt, toHours, type EntryLike,
} from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type Member = { id: string; full_name: string; section_slug: string | null; status: string; positions: string[] };
type EntryWithDate = EntryLike & { ride: { ride_date: string } | null };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const now = new Date();
  const sp = await searchParams;
  const { year, month0 } = parseMonthParam(sp.m, { year: now.getFullYear(), month0: now.getMonth() });
  const { start, end } = monthRange(year, month0);

  // Rolling 12-week window for the club volume chart (independent of the month).
  const pad2 = (x: number) => String(x).padStart(2, "0");
  const since = new Date(now);
  since.setDate(since.getDate() - 7 * 13);
  const sinceISO = `${since.getFullYear()}-${pad2(since.getMonth() + 1)}-${pad2(since.getDate())}`;

  const supabase = await createClient();
  const [{ data: entryData }, { data: memberData }, { data: weeklyData }] = await Promise.all([
    supabase
      .from("ride_entries")
      .select("athlete_id, participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, ride:training_rides!inner(ride_date)")
      .gte("ride.ride_date", start)
      .lt("ride.ride_date", end),
    supabase.from("team_members").select("id, full_name, section_slug, status, positions"),
    supabase
      .from("ride_entries")
      .select("participated, distance_km, moving_seconds, ride:training_rides!inner(ride_date)")
      .gte("ride.ride_date", sinceISO),
  ]);

  const entries = (entryData as unknown as EntryWithDate[] | null) ?? [];
  const members = (memberData as Member[] | null) ?? [];
  const weeklyRows = (weeklyData as unknown as { participated: boolean; distance_km: number | null; moving_seconds: number | null; ride: { ride_date: string } | null }[] | null) ?? [];
  const clubWeekly = weeklyVolume(
    weeklyRows.map((r) => ({ ride_date: r.ride?.ride_date ?? "", distance_km: r.distance_km, moving_seconds: r.moving_seconds, participated: r.participated })),
    12,
    now,
  ).map((w) => ({ label: w.label, value: w.km, display: `${w.km}` }));
  const nameById = new Map(members.map((m) => [m.id, m]));
  const stats = aggregateMonthly(entries);

  const idsToShow = new Set<string>();
  for (const m of members) if (m.status === "active" && m.positions?.includes("rider")) idsToShow.add(m.id);
  for (const id of stats.keys()) idsToShow.add(id);

  const rows: ProgressRow[] = [...idsToShow].map((id) => {
    const m = nameById.get(id);
    const s = stats.get(id);
    return {
      athlete_id: id,
      name: m?.full_name ?? "—",
      section: m?.section_slug ?? null,
      participations: s?.participations ?? 0,
      total_km: s?.total_km ?? 0,
      total_seconds: s?.total_seconds ?? 0,
      total_elevation: s?.total_elevation ?? 0,
      avg_hr: s?.avg_hr ?? null,
      avg_ftp: s?.avg_ftp ?? null,
      avg_power: s?.avg_power ?? null,
      avg_5m: s?.avg_5m ?? null,
      avg_10m: s?.avg_10m ?? null,
      avg_20m: s?.avg_20m ?? null,
    };
  });

  const totalParticipations = rows.reduce((s, r) => s + r.participations, 0);
  const totalKm = rows.reduce((s, r) => s + r.total_km, 0);
  const totalHours = rows.reduce((s, r) => s + toHours(r.total_seconds), 0);
  const activeRiders = rows.filter((r) => r.participations > 0).length;
  const riderKm = rows
    .filter((r) => r.total_km > 0)
    .sort((a, b) => b.total_km - a.total_km)
    .slice(0, 12)
    .map((r) => ({ label: r.name, value: r.total_km, display: `${fmt(r.total_km, 0)} km` }));

  const prev = shiftMonth(year, month0, -1);
  const next = shiftMonth(year, month0, 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Progresi mujor</h1>
          <div className="sub">Pjesëmarrja dhe performanca e secilit çiklist — kliko titujt për renditje.</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/athletes">Çiklistët →</Link>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Pjesëmarrje" value={String(totalParticipations)} sub={monthLabel(year, month0)} />
        <Kpi label="Kilometra" value={fmt(totalKm, 0)} sub="km këtë muaj" />
        <Kpi label="Orë" value={fmt(totalHours, 1)} sub="orë këtë muaj" />
        <Kpi label="Çiklistë aktivë" value={String(activeRiders)} sub={`nga ${rows.length}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="card-head" style={{ marginBottom: 10 }}><h3>Volumi i klubit</h3><span className="kicker">km · 12 javët e fundit</span></div>
          <ColumnChart data={clubWeekly} color="#4F8A88" />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="card-head" style={{ marginBottom: 10 }}><h3>KM për çiklist</h3><span className="kicker">{monthLabel(year, month0)}</span></div>
          <RowBars data={riderKm} />
        </div>
      </div>

      <div className="filter-bar" style={{ borderRadius: 12, border: "1px solid var(--line)", marginBottom: 12 }}>
        <Link className="chip" href={`/admin/training/progress?m=${monthParam(prev.year, prev.month0)}`}>← {monthLabel(prev.year, prev.month0)}</Link>
        <span className="chip active" style={{ cursor: "default" }}>{monthLabel(year, month0)}</span>
        <Link className="chip" href={`/admin/training/progress?m=${monthParam(next.year, next.month0)}`}>{monthLabel(next.year, next.month0)} →</Link>
        <div className="spacer" />
        <span className="meta">{totalParticipations} pjesëmarrje · {fmt(totalKm, 0)} km · {fmt(totalHours, 1)} orë</span>
      </div>

      <div className="scroll-x">
        <ProgressTable rows={rows} />
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      {sub ? <div className="delta">{sub}</div> : null}
    </div>
  );
}
