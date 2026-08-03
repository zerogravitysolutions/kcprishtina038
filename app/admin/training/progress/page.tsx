import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { ProgressTable, type ProgressRow } from "./ProgressTable";
import {
  aggregateMonthly, monthRange, monthLabel, parseMonthParam, monthParam, shiftMonth,
  fmt, toHours, type EntryLike,
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

  const supabase = await createClient();
  const [{ data: entryData }, { data: memberData }] = await Promise.all([
    supabase
      .from("ride_entries")
      .select("athlete_id, participated, distance_km, moving_seconds, elevation_m, avg_hr, max_hr, avg_power_w, ftp_w, best_power_1m_w, best_power_3m_w, best_power_5m_w, best_power_10m_w, best_power_20m_w, best_power_60m_w, ride:training_rides!inner(ride_date)")
      .gte("ride.ride_date", start)
      .lt("ride.ride_date", end),
    supabase.from("team_members").select("id, full_name, section_slug, status, positions"),
  ]);

  const entries = (entryData as unknown as EntryWithDate[] | null) ?? [];
  const members = (memberData as Member[] | null) ?? [];
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
