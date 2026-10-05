import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { clubTodayISO } from "@/lib/clubtime";
import { recentlyActiveRiders } from "@/lib/active-riders";
import { ColumnChart, TargetBars, type Point, type TargetRow } from "../charts";
import { TeamTargets } from "./TeamTargets";
import { FtpTargetsModal, type FtpModalMonth } from "./FtpTargetsModal";
import { KpiTabs } from "./KpiTabs";
import { addMonths, buildSeries, monthStart, targetOn, type FtpTarget, type KpiBucket, type KpiEntry, type KpiView, type TeamTarget } from "@/lib/kpi";
import { fmt, monthLabel } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "KPI-të e stërvitjes" };

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type EntryRow = {
  athlete_id: string;
  participated: boolean;
  moving_seconds: number | null;
  elevation_m: number | null;
  best_power_20m_w: number | null;
  ride: { ride_date: string } | null;
};

const PAGE = 1000;

/**
 * Every entry since `since`, page by page. PostgREST caps a single response
 * (1000 rows by default) without an error, and a team that rides a few times a
 * week passes that within a year — a silent cut would drop the OLDEST weeks and
 * make a cyclist look like they trained less than they did.
 */
async function fetchEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  since: string,
): Promise<{ rows: EntryRow[]; failed: boolean }> {
  const rows: EntryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ride_entries")
      .select("id, athlete_id, participated, moving_seconds, elevation_m, best_power_20m_w, ride:training_rides!inner(ride_date)")
      .gte("ride.ride_date", since)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { rows, failed: true };
    const page = (data as unknown as EntryRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, failed: false };
}

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active" || !COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const today = clubTodayISO();
  const view: KpiView = (await searchParams).v === "month" ? "month" : "week";

  const supabase = await createClient();
  // A year back covers 8 weeks, 6 months, and the month BEFORE the oldest
  // one shown (which is that month's 20-min target).
  const since = `${String(Number(today.slice(0, 4)) - 1)}-${today.slice(5, 7)}-01`;
  const [entryRes, targetRes, ftpRes, activeRiders] = await Promise.all([
    fetchEntries(supabase, since),
    supabase.from("team_kpi_targets").select("effective_from, weekly_hours, weekly_elevation_m").order("effective_from"),
    supabase.from("athlete_ftp_targets").select("athlete_id, period, target_w").gte("period", since),
    recentlyActiveRiders(supabase),
  ]);

  const loadFailed = entryRes.failed || !!targetRes.error || !!ftpRes.error;
  // The 20-min targets a coach typed, per rider; a month without one is automatic.
  const ftpByAthlete = new Map<string, FtpTarget[]>();
  for (const f of (ftpRes.data as (FtpTarget & { athlete_id: string })[] | null) ?? []) {
    if (!ftpByAthlete.has(f.athlete_id)) ftpByAthlete.set(f.athlete_id, []);
    ftpByAthlete.get(f.athlete_id)!.push({ period: f.period, target_w: f.target_w });
  }
  const targets = (targetRes.data as TeamTarget[] | null) ?? [];

  const byAthlete = new Map<string, KpiEntry[]>();
  for (const e of entryRes.rows) {
    const entry: KpiEntry = {
      athlete_id: e.athlete_id,
      ride_date: e.ride?.ride_date ?? "",
      participated: e.participated,
      moving_seconds: e.moving_seconds,
      elevation_m: e.elevation_m,
      best_power_20m_w: e.best_power_20m_w,
    };
    if (!byAthlete.has(e.athlete_id)) byAthlete.set(e.athlete_id, []);
    byAthlete.get(e.athlete_id)!.push(entry);
  }

  // Riders: active roster riders who trained in the last 30 days.
  const riders = activeRiders.map((m) => ({ id: m.id, name: m.full_name }));

  const count = view === "week" ? 8 : 6;
  const series = new Map<string, KpiBucket[]>();
  const months = new Map<string, KpiBucket[]>();
  for (const r of riders) {
    const own = byAthlete.get(r.id) ?? [];
    series.set(r.id, buildSeries({ entries: own, view, count, today, targets }));
    months.set(r.id, buildSeries({ entries: own, view: "month", count: 6, today, targets, ftpTargets: ftpByAthlete.get(r.id) ?? [] }));
  }
  const frame = buildSeries({ entries: [], view, count, today, targets });
  const monthFrame = buildSeries({ entries: [], view: "month", count: 6, today, targets });
  const last = frame.length - 1;
  const lastMonth = monthFrame.length - 1;
  const per = view === "week" ? "javë" : "muaj";

  const target = targetOn(targets, today);
  const ranked = (pick: (b: KpiBucket) => number, goal: (b: KpiBucket) => number | null, show: (v: number) => string): TargetRow[] =>
    riders
      .map((r) => ({ r, b: series.get(r.id)![last] }))
      .sort((a, z) => pick(z.b) - pick(a.b))
      .map(({ r, b }) => ({ label: r.name, value: pick(b), target: goal(b), display: show(pick(b)), href: `/admin/athletes/${r.id}`, current: true }));

  // The team's average per cyclist in each period, against the target.
  const average = (pick: (b: KpiBucket) => number, goal: (b: KpiBucket) => number | null, show: (v: number) => string, short: (v: number) => string): Point[] =>
    frame.map((f, i) => {
      const avg = riders.length ? riders.reduce((s, r) => s + pick(series.get(r.id)![i]), 0) / riders.length : 0;
      return { label: f.label, value: Math.round(avg * 10) / 10, display: show(avg), short: short(avg), target: goal(f), current: f.current };
    });

  const hoursRows = ranked((b) => b.hours, (b) => b.targetHours, (v) => `${fmt(v, 1)} orë`);
  const climbRows = ranked((b) => b.elevation, (b) => b.targetElevation, (v) => `${fmt(v, 0)} m`);

  // 20-minute power: this month's best against last month's best — both read
  // from registered trainings, nothing typed.
  const powerRows: TargetRow[] = riders
    .map((r) => ({ r, b: months.get(r.id)![lastMonth] }))
    .filter(({ b }) => b.power20 != null || b.targetPower20 != null)
    .sort((a, z) => (z.b.power20 ?? 0) - (a.b.power20 ?? 0))
    .map(({ r, b }) => ({
      label: r.name, value: b.power20 ?? 0, target: b.targetPower20,
      display: b.power20 != null ? `${b.power20} W` : "pa të dhëna", href: `/admin/athletes/${r.id}`, current: true,
    }));
  const powerTrend: Point[] = monthFrame.map((f, i) => {
    const vals = riders.map((r) => months.get(r.id)![i].power20).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { label: f.label, value: Math.round(avg), display: avg ? `${fmt(avg, 0)} W` : "pa të dhëna", short: fmt(avg, 0), current: f.current };
  });

  // The "Targetet FTP" dialog: last two months, this month and next, for every
  // ACTIVE cyclist (a past member who trained earlier is not offered a target).
  const best20 = (id: string, period: string): number | null => {
    let best: number | null = null;
    for (const e of byAthlete.get(id) ?? []) {
      if (e.participated && e.best_power_20m_w != null && monthStart(e.ride_date) === period && (best == null || e.best_power_20m_w > best)) best = e.best_power_20m_w;
    }
    return best;
  };
  const thisMonth = monthStart(today);
  const ftpModalMonths: FtpModalMonth[] = [-2, -1, 0, 1].map((off) => {
    const period = addMonths(thisMonth, off);
    const [y, m] = period.split("-").map(Number);
    return {
      period,
      label: monthLabel(y, m - 1),
      rows: activeRiders.map((r) => ({
        id: r.id,
        name: r.full_name,
        target: ftpByAthlete.get(r.id)?.find((f) => f.period === period)?.target_w ?? null,
        best: best20(r.id, period),
        prevBest: best20(r.id, addMonths(period, -1)),
      })),
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>KPI-të e stërvitjes</h1>
          <div className="sub">Të gjitha vijnë nga stërvitjet e regjistruara — vetëm targeti vendoset këtu.</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/training/progress">Progresi →</Link>
      </div>

      <KpiTabs active="overview" />

      {loadFailed ? (
        <div className="mm-msg err" style={{ marginBottom: 16 }}>
          Disa të dhëna nuk u lexuan. Grafikët mund të jenë jo të plotë — rifresko faqen.
        </div>
      ) : null}

      <TeamTargets current={{ weekly_hours: target?.weekly_hours ?? null, weekly_elevation_m: target?.weekly_elevation_m ?? null }}>
        <FtpTargetsModal months={ftpModalMonths} defaultIndex={2} />
      </TeamTargets>

      <div className="filter-bar">
        <Link className={`chip ${view === "week" ? "active" : ""}`} href={"/admin/training/kpi?v=week" as never}>Javore</Link>
        <Link className={`chip ${view === "month" ? "active" : ""}`} href={"/admin/training/kpi?v=month" as never}>Mujore</Link>
        <div className="spacer" />
        <span className="meta">{riders.length} çiklistë · vija e ndërprerë = targeti</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
        <Panel title="Orët e stërvitjes" note={`${frame[last].label} · në vazhdim`}>
          <TargetBars data={hoursRows} empty="Nuk ka çiklistë." />
          <Sub>Mesatarja për çiklist, për {per}</Sub>
          <ColumnChart data={average((b) => b.hours, (b) => b.targetHours, (v) => `${fmt(v, 1)} orë`, (v) => fmt(v, 1))} labels="all" targetUnit="orë" />
        </Panel>
        <Panel title="Ngjitja" note={`${frame[last].label} · në vazhdim`}>
          <TargetBars data={climbRows} empty="Nuk ka çiklistë." />
          <Sub>Mesatarja për çiklist, për {per}</Sub>
          <ColumnChart data={average((b) => b.elevation, (b) => b.targetElevation, (v) => `${fmt(v, 0)} m`, (v) => fmt(v, 0))} labels="all" targetUnit="m" />
        </Panel>
        <Panel title="Fuqia 20-min" note={`${monthFrame[lastMonth].label} · kundrejt targetit ose muajit të kaluar`}>
          <TargetBars data={powerRows} empty="Asnjë çiklist nuk ka fuqi 20-min të regjistruar." />
          <Sub>Mesatarja e ekipit, më e mira e muajit</Sub>
          <ColumnChart data={powerTrend} labels="all" />
        </Panel>
      </div>
    </>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, minWidth: 0 }}>
      <div className="card-head" style={{ marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <h3>{title}</h3>
        {note ? <span className="kicker">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", margin: "18px 0 6px" }}>
      {children}
    </div>
  );
}
