"use client";

// Two-series monthly combo chart for the finance report: an invoiced "track"
// bar with the collected amount filled inside it, plus the collection-rate line
// on top. Same hand-rolled SVG approach as app/admin/training/charts.tsx —
// theme-aware CSS vars, recessive axes, rounded bar ends, hover tooltip, no
// chart library. Two series means this one DOES need a legend, unlike the
// single-series charts over there.

import { useState } from "react";

export type TrendPoint = {
  /** Short month label under the bar, e.g. "Gush". */
  label: string;
  /** Full month name for the tooltip, e.g. "Gusht 2026". */
  full: string;
  billed: number;
  collected: number;
  billedLabel: string;
  collectedLabel: string;
  /** Null when nothing was invoiced that month — no rate exists. */
  rate: number | null;
};

const COLLECTED = "#16A34A";
const RATE = "#2E90FA";
const TRACK = "var(--surface-2, #F3F4F6)";
const STRONG = "var(--chart-strong, #101828)";
const AXIS = "var(--chart-axis, #98A2B3)";
const GRID = "var(--chart-grid, rgba(16,24,40,.08))";
const DOT_STROKE = "var(--chart-bg, #fff)";

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export function BilledVsCollected({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 200, padT = 26, padB = 30, padX = 12;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const n = Math.max(1, data.length);
  const band = (W - padX * 2) / n;
  const barW = Math.min(28, band * 0.58);
  const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.collected)));

  const bars = data.map((d, i) => {
    const hBilled = (d.billed / max) * plotH;
    const hPaid = (d.collected / max) * plotH;
    const x = padX + i * band + (band - barW) / 2;
    return { d, i, x, hBilled, hPaid, cx: x + barW / 2, yPaid: baseY - hPaid };
  });

  // The rate line sits on its own 0–100% scale across the same plot height.
  const ratePts = bars
    .filter((b) => b.d.rate != null)
    .map((b) => ({ ...b, y: baseY - ((b.d.rate as number) / 100) * plotH }));
  const line = ratePts.map((p) => `${p.cx},${p.y}`).join(" ");

  const active = hover != null ? bars[hover] : null;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8, fontSize: 11.5, color: "var(--text-3)" }}>
        <Key color={TRACK} border label="Faturuar" />
        <Key color={COLLECTED} label="Arkëtuar" />
        <Key color={RATE} label="Norma e arkëtimit" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Faturuar dhe arkëtuar sipas muajve">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padX} y1={padT + t * plotH} x2={W - padX} y2={padT + t * plotH} style={{ stroke: GRID }} strokeWidth={1} />
        ))}
        {bars.map((b) => (
          <g key={b.i} onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover((h) => (h === b.i ? null : h))}>
            <title>{`${b.d.full}: faturuar ${b.d.billedLabel}, arkëtuar ${b.d.collectedLabel}`}</title>
            <rect x={padX + b.i * band} y={padT} width={band} height={plotH + 6} fill="transparent" />
            <path d={barPath(b.x, baseY - b.hBilled, barW, b.hBilled, 3)} style={{ fill: TRACK, opacity: hover == null || hover === b.i ? 1 : 0.5 }} />
            <path d={barPath(b.x, b.yPaid, barW, b.hPaid, 3)} style={{ fill: COLLECTED, opacity: hover == null || hover === b.i ? 1 : 0.45 }} />
            <text x={b.cx} y={H - 11} textAnchor="middle" style={{ fill: AXIS, fontSize: 9, fontFamily: "var(--font-mono)" }}>{b.d.label}</text>
          </g>
        ))}
        {ratePts.length > 1 && (
          <polyline points={line} fill="none" style={{ stroke: RATE }} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
        )}
        {ratePts.map((p) => (
          <circle key={p.i} cx={p.cx} cy={p.y} r={hover === p.i ? 4.5 : 3} style={{ fill: RATE, stroke: DOT_STROKE }} strokeWidth={1.5} pointerEvents="none" />
        ))}
        {active && (
          <g pointerEvents="none">
            <text x={Math.max(60, Math.min(W - 60, active.cx))} y={12} textAnchor="middle" style={{ fill: STRONG, fontSize: 10.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {`${active.d.collectedLabel} / ${active.d.billedLabel}`}
            </text>
            <text x={Math.max(60, Math.min(W - 60, active.cx))} y={23} textAnchor="middle" style={{ fill: AXIS, fontSize: 9.5, fontFamily: "var(--font-mono)" }}>
              {active.d.rate == null ? "pa fatura" : `${active.d.rate}% · ${active.d.full}`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function Key({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0,
          border: border ? "1px solid var(--line-strong)" : undefined,
        }}
      />
      {label}
    </span>
  );
}
