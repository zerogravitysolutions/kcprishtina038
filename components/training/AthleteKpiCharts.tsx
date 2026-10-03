import type { Point } from "@/app/admin/training/charts";
import { buildSeries, paceOf, periodClock, pct, type FtpTarget, type KpiBucket, type KpiEntry, type PaceStatus, type TeamTarget } from "@/lib/kpi";
import { fmt } from "@/lib/training";
import { KpiChartCard } from "./KpiChartCard";

// One cyclist's KPI picture: for each KPI, where this week / month stands and
// what is still missing, then one chart per KPI. Nothing is typed in anywhere —
// every number comes from the registered trainings handed in. A Server
// Component: `today` is the club's calendar day from the server, so nothing
// here reads a clock.
//
// Shared by the cyclist's own portal page (they work toward the target) and the
// coach's athlete page, so both read exactly the same thing.

const CARD = {
  background: "var(--white, #fff)",
  border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)",
} as const;

const OK = "var(--ok, #16A34A)";
const WARN = "var(--warn, #B45309)";
const MUTED = "var(--ink-3, #6b7686)";

const STATUS: Record<PaceStatus, { label: string; color: string }> = {
  hit: { label: "Arritur", color: OK },
  ontrack: { label: "Në ritëm", color: OK },
  behind: { label: "Pak prapa", color: WARN },
  none: { label: "Pa target", color: MUTED },
};

export function AthleteKpiCharts({
  entries, targets, today, ftpTargets = [],
}: {
  entries: KpiEntry[];
  targets: TeamTarget[];
  today: string;
  /** This cyclist's coach-typed 20-min targets by month; a month without one is compared with last month's best. */
  ftpTargets?: FtpTarget[];
}) {
  const weeks = buildSeries({ entries, view: "week", count: 12, today, targets });
  const months = buildSeries({ entries, view: "month", count: 6, today, targets, ftpTargets });
  const wk = weeks[weeks.length - 1];
  const mo = months[months.length - 1];
  const weekClock = periodClock("week", today);

  const hoursPace = paceOf(wk.hours, wk.targetHours, weekClock);
  const climbPace = paceOf(wk.elevation, wk.targetElevation, weekClock);

  // 20-minute power is one best effort, not an accumulation: no pace, just
  // "reached or not yet". Its target is what the coach set for this cyclist for
  // this month, or, with none, the cyclist's own best of last month.
  const prev = mo.targetPower20;
  const powerStatus: PaceStatus = prev == null ? "none" : mo.power20 != null && mo.power20 >= prev ? "hit" : "behind";
  const powerLine = mo.targetPower20Set && prev != null
    ? powerStatus === "hit" ? `Targeti yt u arrit (${fmt(prev, 0)} W).`
      : mo.power20 == null ? `Ende pa përpjekje 20-min këtë muaj. Targeti yt: ${fmt(prev, 0)} W.`
      : `Edhe ${fmt(prev - mo.power20, 0)} W deri te targeti yt (${fmt(prev, 0)} W).`
    : prev == null ? "Ende pa krahasim — muaji i kaluar nuk ka përpjekje 20-min të regjistruar."
    : powerStatus === "hit" ? `Më mirë se muaji i kaluar (${fmt(prev, 0)} W).`
    : mo.power20 == null ? `Ende pa përpjekje 20-min këtë muaj. Të kaluarën: ${fmt(prev, 0)} W.`
    : `Edhe ${fmt(prev - mo.power20, 0)} W për ta kaluar muajin e kaluar (${fmt(prev, 0)} W).`;

  const noTargets = weeks.every((w) => w.targetHours == null && w.targetElevation == null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      {noTargets ? (
        <div className="mono" style={{ ...CARD, padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: MUTED }}>
          Trajneri nuk ka vendosur ende target për orët dhe ngjitjen. Grafikët tregojnë ç’ke bërë deri tani.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 16 }}>
        <KpiCard
          label="Orë këtë javë" status={hoursPace.status}
          value={fmt(wk.hours, 1)} unit="orë" target={wk.targetHours} targetText={(t) => `${fmt(t, 1)} orë`}
          p={pct(wk.hours, wk.targetHours)}
          line={paceLine(hoursPace.status, hoursPace.remaining, hoursPace.perDay, hoursPace.daysLeft, "orë", 1)}
        />
        <KpiCard
          label="Ngjitje këtë javë" status={climbPace.status}
          value={fmt(wk.elevation, 0)} unit="m" target={wk.targetElevation} targetText={(t) => `${fmt(t, 0)} m`}
          p={pct(wk.elevation, wk.targetElevation)}
          line={paceLine(climbPace.status, climbPace.remaining, climbPace.perDay, climbPace.daysLeft, "m", 0)}
        />
        <KpiCard
          label="Fuqia 20-min këtë muaj" status={powerStatus}
          value={mo.power20 != null ? fmt(mo.power20, 0) : "—"} unit={mo.power20 != null ? "W" : ""}
          target={prev} targetText={(t) => `${fmt(t, 0)} W`}
          p={pct(mo.power20, prev)}
          line={powerLine}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
        <KpiChartCard
          title="Orët e stërvitjes"
          weeks={points(weeks, (b) => b.hours, (b) => b.targetHours, (v) => `${fmt(v, 1)} orë`, (v) => fmt(v, 1))}
          months={points(months, (b) => b.hours, (b) => b.targetHours, (v) => `${fmt(v, 1)} orë`, (v) => fmt(v, 0))}
          targetUnit="orë"
        />
        <KpiChartCard
          title="Ngjitja"
          weeks={points(weeks, (b) => b.elevation, (b) => b.targetElevation, (v) => `${fmt(v, 0)} m`, (v) => fmt(v, 0))}
          months={points(months, (b) => b.elevation, (b) => b.targetElevation, (v) => `${fmt(v, 0)} m`, (v) => fmt(v, 0))}
          targetUnit="m"
        />
        <KpiChartCard
          title="Fuqia 20-min"
          weeks={null}
          months={points(months, (b) => b.power20 ?? 0, (b) => b.targetPower20, (v) => (v > 0 ? `${fmt(v, 0)} W` : "pa të dhëna"), (v) => fmt(v, 0))}
          targetUnit="W"
        />
      </div>
      <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: MUTED }}>
        Vija e ndërprerë = targeti (për fuqinë: ai që vendos trajneri për muajin, ose pa të, më e mira e muajit të kaluar). Shtylla bëhet jeshile kur e arrin; periudha në vazhdim është më e zbehtë.
      </div>
    </div>
  );
}

/** "Edhe 5,9 orë deri të dielën — rreth 2 orë në ditë." */
function paceLine(status: PaceStatus, remaining: number, perDay: number | null, daysLeft: number, unit: string, digits: number): string {
  if (status === "none") return "Pa target për këtë javë.";
  if (status === "hit") return "Targeti u arrit. Çdo gjë mbi të është bonus.";
  const perDayText = perDay != null && daysLeft > 1 ? ` — rreth ${fmt(perDay, digits)} ${unit} në ditë` : "";
  return `Edhe ${fmt(remaining, digits)} ${unit} deri të dielën${perDayText}.`;
}

function points(
  buckets: KpiBucket[],
  value: (b: KpiBucket) => number,
  target: (b: KpiBucket) => number | null,
  show: (v: number) => string,
  short: (v: number) => string,
): Point[] {
  return buckets.map((b) => ({ label: b.label, value: value(b), display: show(value(b)), short: short(value(b)), target: target(b), current: b.current }));
}

function KpiCard({
  label, status, value, unit, target, targetText, p, line,
}: {
  label: string; status: PaceStatus; value: string; unit: string;
  target: number | null; targetText: (t: number) => string;
  p: number | null; line: string;
}) {
  const s = STATUS[status];
  return (
    <div style={{ ...CARD, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: MUTED }}>{label}</div>
        <span
          className="mono"
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5, padding: "3px 9px", borderRadius: 999, flexShrink: 0,
            color: s.color, background: `color-mix(in oklab, ${s.color} 12%, transparent)`,
          }}
        >
          {s.label}
        </span>
      </div>

      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        {value}{unit ? <span style={{ fontSize: 14, color: MUTED, fontWeight: 400 }}> {unit}</span> : null}
        {target != null ? <span style={{ fontSize: 14, color: MUTED, fontWeight: 400 }}> / {targetText(target)}</span> : null}
      </div>

      {target != null ? (
        <div style={{ height: 10, borderRadius: 6, background: "var(--paper-2, #eef1f4)" }}>
          <div style={{ width: `${Math.min(100, p ?? 0)}%`, height: "100%", background: s.color, borderRadius: 6 }} />
        </div>
      ) : null}

      <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{line}</div>
    </div>
  );
}
