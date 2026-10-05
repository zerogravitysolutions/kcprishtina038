import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/supabase/server";
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

async function allEfforts(admin: ReturnType<typeof createAdminClient>): Promise<SegmentEffort[]> {
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

export default async function SegmentKpiPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active" || !COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const admin = createAdminClient();
  const [memberRes, connectionRes, statsRes, efforts] = await Promise.all([
    admin.from("team_members").select("id, full_name")
      .eq("status", "active").contains("positions", ["rider"]).order("full_name"),
    admin.from("strava_connections").select("athlete_id"),
    admin.from("strava_segment_stats").select("*")
      .in("segment_id", TRACKED_SEGMENTS.map((segment) => segment.id)),
    allEfforts(admin),
  ]);
  const error = memberRes.error ?? connectionRes.error ?? statsRes.error;
  if (error) throw error;
  const riders = (memberRes.data ?? []).map((member) => ({ id: member.id, name: member.full_name }));
  const connected = new Set((connectionRes.data ?? []).map((connection) => connection.athlete_id));
  const stats = (statsRes.data ?? []) as SegmentStats[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Segmentet kryesore</h1>
          <div className="sub">Çiklistët aktivë, të renditur sipas kohës së tyre më të shpejtë në secilin segment.</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/training/kpi">← KPI-të</Link>
      </div>
      <KpiTabs active="segments" />
      <div className={styles.sections}>
        {TRACKED_SEGMENTS.map((segment) => {
          const rows = buildSegmentLeaderboard(riders, connected, efforts, stats, segment.id);
          return (
            <section key={segment.id} className={styles.segment} aria-labelledby={`segment-${segment.id}`}>
              <div className={styles.segmentHead}>
                <div>
                  <div className={styles.eyebrow}>SEGMENTI {TRACKED_SEGMENTS.findIndex((item) => item.id === segment.id) + 1}</div>
                  <h2 id={`segment-${segment.id}`}>{segment.name}</h2>
                  <p>{segment.distanceKm.toFixed(2)} km · {segment.grade}% pjerrësi mesatare</p>
                </div>
                <span className={styles.count}>{rows.filter((row) => row.pb).length}/{riders.length} me rezultat</span>
              </div>
              <div className={styles.list}>
                {rows.map((row) => <RiderRow key={row.id} row={row} />)}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function RiderRow({ row }: { row: SegmentLeaderboardRow }) {
  const delta = row.pb && row.latest ? row.latest.elapsedSeconds - row.pb.elapsedSeconds : null;
  return (
    <div className={`${styles.rider} ${row.rank === 1 ? styles.leader : ""}`}>
      <div className={styles.identity}>
        <span className={styles.rank}>{row.rank ? String(row.rank).padStart(2, "0") : "—"}</span>
        <div>
          <Link href={`/admin/athletes/${row.id}`} className={styles.name}>{row.name}</Link>
          {!row.connected && <div className={styles.connection}>Strava pa lidhje</div>}
        </div>
      </div>
      <div className={styles.result}>
        <span className={styles.label}>{row.pb && !row.pbVerified ? "MË E MIRA E IMPORTUAR" : "PB"}</span>
        {row.pb ? <><strong>{formatDurationHMS(row.pb.elapsedSeconds)}</strong><span>{shortDate(row.pb.date)} · {metric(row.pb.avgPowerW, "W")}</span></> : <strong>—</strong>}
      </div>
      <div className={styles.result}>
        <span className={styles.label}>PËRPJEKJA E FUNDIT</span>
        {row.latest ? <>
          <strong>{formatDurationHMS(row.latest.elapsedSeconds)} {row.latestIsPb && <span role="img" aria-label="PB në përpjekjen e fundit" title="PB në përpjekjen e fundit">👑</span>}</strong>
          <span>{shortDate(row.latest.date)}{delta && delta > 0 ? ` · +${formatDurationHMS(delta)} nga PB` : ""}</span>
        </> : <strong>—</strong>}
      </div>
      <div className={styles.metrics}>
        <span className={styles.label}>MATJET E FUNDIT</span>
        <span>{row.latest ? `${metric(row.latest.avgPowerW, "W")} · ${metric(row.latest.avgHr, "bpm")}` : "—"}</span>
        {row.latest && <span>HR max {metric(row.latest.maxHr, "bpm")} · {metric(row.latest.avgCadence, "rpm")}</span>}
      </div>
    </div>
  );
}
