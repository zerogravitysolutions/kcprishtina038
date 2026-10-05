import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/supabase/server";
import { buildFortyKmLeaderboard, fortyKmKmh, type FortyKmEffort, type FortyKmRow } from "@/lib/forty-km-leaderboard";
import { buildSegmentLeaderboard, TRACKED_SEGMENTS, type SegmentEffort, type SegmentLeaderboardRow, type SegmentStats } from "@/lib/segment-leaderboard";
import { formatDurationHMS } from "@/lib/training";
import { KpiTabs } from "../KpiTabs";
import styles from "./segments.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Segmentet · KPI" };

const COACH_ROLES = ["admin", "editor", "staff", "coach"];
const PAGE = 1000;

function shortDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function metric(value: number | null, unit: string): string {
  return value == null ? "—" : `${Math.round(value)} ${unit}`;
}

function speed(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} km/h`;
}

async function allSegmentEfforts(admin: ReturnType<typeof createAdminClient>): Promise<SegmentEffort[]> {
  const rows: SegmentEffort[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from("strava_segment_efforts").select("*")
      .in("segment_id", TRACKED_SEGMENTS.map((segment) => segment.id))
      .order("started_at").order("athlete_id").order("segment_id").order("strava_activity_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function allFortyKmEfforts(admin: ReturnType<typeof createAdminClient>): Promise<FortyKmEffort[]> {
  const rows: FortyKmEffort[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from("strava_40km_efforts").select("*")
      .order("ride_started_at").order("athlete_id").order("strava_activity_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export default async function SegmentKpiPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active" || !COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const admin = createAdminClient();
  const [memberRes, connectionRes, statsRes, backfillRes, segmentEfforts, fortyKmEfforts] = await Promise.all([
    admin.from("team_members").select("id, full_name")
      .eq("status", "active").contains("positions", ["rider"]).order("full_name"),
    admin.from("strava_connections").select("athlete_id"),
    admin.from("strava_segment_stats").select("*")
      .in("segment_id", TRACKED_SEGMENTS.map((segment) => segment.id)),
    admin.from("strava_40km_backfills").select("athlete_id, completed"),
    allSegmentEfforts(admin), allFortyKmEfforts(admin),
  ]);
  const error = memberRes.error ?? connectionRes.error ?? statsRes.error ?? backfillRes.error;
  if (error) throw error;
  const riders = (memberRes.data ?? []).map((member) => ({ id: member.id, name: member.full_name }));
  const connected = new Set((connectionRes.data ?? []).map((connection) => connection.athlete_id));
  const completed = new Set((backfillRes.data ?? []).filter((job) => job.completed).map((job) => job.athlete_id));
  const stats = (statsRes.data ?? []) as SegmentStats[];
  const fortyKmRows = buildFortyKmLeaderboard(riders, connected, completed, fortyKmEfforts);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Segmentet kryesore</h1>
          <div className="sub">Performancat më të mira dhe përpjekjet e fundit të çiklistëve aktivë.</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/training/kpi">← KPI-të</Link>
      </div>
      <KpiTabs active="segments" />
      <div className={styles.panels}>
        <PerformancePanel title="40 km më të shpejta" note="40 km · shpejtësia mesatare" count={fortyKmRows.filter((row) => row.pb).length} total={riders.length}>
          {fortyKmRows.map((row) => <FortyKmRider key={row.id} row={row} leaderSeconds={fortyKmRows[0]?.pb?.duration_seconds ?? null} />)}
        </PerformancePanel>
        {TRACKED_SEGMENTS.map((segment) => {
          const rows = buildSegmentLeaderboard(riders, connected, segmentEfforts, stats, segment.id);
          return (
            <PerformancePanel key={segment.id} title={segment.name}
              note={`${segment.distanceKm.toFixed(2)} km · ${segment.grade}% ngjitje`}
              count={rows.filter((row) => row.pb).length} total={riders.length}>
              {rows.map((row) => <SegmentRider key={row.id} row={row} leaderSeconds={rows[0]?.pb?.elapsedSeconds ?? null} />)}
            </PerformancePanel>
          );
        })}
      </div>
    </>
  );
}

function PerformancePanel({ title, note, count, total, children }: {
  title: string; note: string; count: number; total: number; children: React.ReactNode;
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHead}>
        <div><h2>{title}</h2><span>{note}</span></div>
        <span className={styles.count}>{count}/{total} me rezultat</span>
      </div>
      <div className={styles.list}>{children}</div>
    </section>
  );
}

function RiderHead({ id, name, rank, crown }: { id: string; name: string; rank: number | null; crown: boolean }) {
  return (
    <div className={styles.riderHead}>
      <span className={styles.rank}>{rank ? String(rank).padStart(2, "0") : "—"}</span>
      <Link href={`/admin/athletes/${id}`} className={styles.name}>{name}</Link>
      {crown && <span className={styles.crown} role="img" aria-label="PB në përpjekjen e fundit" title="PB në përpjekjen e fundit">👑</span>}
    </div>
  );
}

function ResultBar({ ratio }: { ratio: number | null }) {
  return <div className={styles.track}><div className={styles.fill} style={{ width: ratio == null ? "0%" : `${Math.max(3, ratio * 100)}%` }} /></div>;
}

function SegmentRider({ row, leaderSeconds }: { row: SegmentLeaderboardRow; leaderSeconds: number | null }) {
  const ratio = row.pb && leaderSeconds ? leaderSeconds / row.pb.elapsedSeconds : null;
  return (
    <div className={styles.rider}>
      <RiderHead id={row.id} name={row.name} rank={row.rank} crown={row.latestIsPb} />
      {row.pb ? <>
        <div className={styles.primary}><span>{row.pbVerified ? "PB" : "Më e mira e importuar"}</span><strong>{formatDurationHMS(row.pb.elapsedSeconds)}</strong></div>
        <div className={styles.detail}>{shortDate(row.pb.date)} · {metric(row.pb.avgPowerW, "W")}</div>
        <ResultBar ratio={ratio} />
        {row.latest && <div className={styles.latest}>
          <span>Fundit {formatDurationHMS(row.latest.elapsedSeconds)} · {shortDate(row.latest.date)}</span>
          <span>{metric(row.latest.avgPowerW, "W")} · {metric(row.latest.avgHr, "bpm")}</span>
        </div>}
      </> : <>
        <div className={styles.empty}>{row.connected ? "Pa rezultat në segment" : "Strava pa lidhje"}</div>
        <ResultBar ratio={null} />
      </>}
    </div>
  );
}

function FortyKmRider({ row, leaderSeconds }: { row: FortyKmRow; leaderSeconds: number | null }) {
  const ratio = row.pb && leaderSeconds ? leaderSeconds / row.pb.duration_seconds : null;
  return (
    <div className={styles.rider}>
      <RiderHead id={row.id} name={row.name} rank={row.rank} crown={row.latestIsPb} />
      {row.pb ? <>
        <div className={styles.primary}><span>{row.historyComplete ? "PB" : "Më e mira e importuar"}</span><strong>{speed(fortyKmKmh(row.pb))}</strong></div>
        <div className={styles.detail}>{formatDurationHMS(Math.round(row.pb.duration_seconds))} · {shortDate(row.pb.ride_date)}</div>
        <ResultBar ratio={ratio} />
        {row.latest && <div className={styles.latest}>
          <span>Fundit {speed(fortyKmKmh(row.latest))}</span>
          <span>{shortDate(row.latest.ride_date)}</span>
        </div>}
      </> : <>
        <div className={styles.empty}>{!row.connected ? "Strava pa lidhje" : row.historyComplete ? "Pa xhiro 40 km" : "Historiku po importohet"}</div>
        <ResultBar ratio={null} />
      </>}
    </div>
  );
}
