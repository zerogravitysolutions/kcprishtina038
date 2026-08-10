"use client";

// Monthly money chart for the finance report. Three quantities, three DIFFERENT
// visual forms, because the page is printed in black and white and hue alone
// would collapse into three identical greys:
//
//   Faturuar        — an outlined, hatched bar: what the month invoiced.
//   Arkëtuar        — a solid bar drawn inside it: how much of that month's own
//                     invoices has been paid. Nested on purpose, since it is a
//                     part of the bar it sits in.
//   Para në arkë    — a flat marker line: cash that actually ARRIVED during the
//                     calendar month, whichever month it was billed for. It is
//                     not part of the bar, so it must not look like part of it.
//   Norma           — the dashed rate line on its own 0–100% scale.
//
// Same hand-rolled SVG approach as app/admin/training/charts.tsx: theme-aware
// CSS vars, recessive axes, rounded bar ends, hover tooltip, no chart library.

import { useState } from "react";

export type TrendPoint = {
  /** Short month label under the bar, e.g. "Gus". */
  label: string;
  /** Full month name for the tooltip, e.g. "Gusht 2026". */
  full: string;
  /** Invoiced FOR this month (waived invoices excluded). */
  billed: number;
  /** Paid, of the invoices billed for this month. */
  collected: number;
  /** Money received DURING this month, by payment date. */
  cash: number;
  billedLabel: string;
  collectedLabel: string;
  cashLabel: string;
  /** Null when nothing was invoiced that month — no rate exists. */
  rate: number | null;
};

const COLLECTED = "#16A34A";
const CASH = "#101828";
const RATE = "#2E90FA";
const TRACK = "var(--surface-2, #F3F4F6)";
const TRACK_LINE = "var(--line-strong, rgba(16,24,40,.16))";
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
  const W = 560, H = 210, padT = 30, padB = 30, padX = 12;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const n = Math.max(1, data.length);
  const band = (W - padX * 2) / n;
  const barW = Math.min(28, band * 0.58);
  // Guarded at 1 so an all-zero month cannot divide by zero and produce NaN
  // coordinates, which render as an invisible (and unexplained) chart.
  const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.collected, d.cash)));
  const yOf = (v: number) => baseY - (Math.max(0, v) / max) * plotH;

  const bars = data.map((d, i) => {
    const x = padX + i * band + (band - barW) / 2;
    return {
      d, i, x,
      cx: x + barW / 2,
      hBilled: baseY - yOf(d.billed),
      hPaid: baseY - yOf(d.collected),
      yPaid: yOf(d.collected),
      yCash: yOf(d.cash),
    };
  });

  // The rate line sits on its own 0–100% scale across the same plot height.
  const ratePts = bars
    .filter((b) => b.d.rate != null)
    .map((b) => ({ ...b, y: baseY - ((b.d.rate as number) / 100) * plotH }));
  const line = ratePts.map((p) => `${p.cx},${p.y}`).join(" ");

  const active = hover != null ? bars[hover] : null;
  const markW = Math.min(band * 0.86, barW + 12);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8, fontSize: 11.5, color: "var(--text-3)" }}>
        <Key kind="hatch" label="Faturuar për muajin" />
        <Key kind="solid" color={COLLECTED} label="Arkëtuar nga ai muaj" />
        <Key kind="rule" color={CASH} label="Para në arkë atë muaj" />
        <Key kind="dash" color={RATE} label="Norma e arkëtimit" />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Faturuar, arkëtuar dhe para në arkë sipas muajve"
      >
        <defs>
          {/* Texture, not hue: the invoiced bar stays distinguishable from the
              collected one on a black-and-white printout. */}
          <pattern id="fin-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" style={{ fill: TRACK }} />
            <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: TRACK_LINE }} strokeWidth={2} />
          </pattern>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padX} y1={padT + t * plotH} x2={W - padX} y2={padT + t * plotH} style={{ stroke: GRID }} strokeWidth={1} />
        ))}
        {bars.map((b) => (
          <g key={b.i} onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover((h) => (h === b.i ? null : h))}>
            <title>
              {`${b.d.full}: faturuar ${b.d.billedLabel}, arkëtuar nga ai muaj ${b.d.collectedLabel}, para në arkë ${b.d.cashLabel}`}
            </title>
            <rect x={padX + b.i * band} y={padT} width={band} height={plotH + 6} fill="transparent" />
            {b.hBilled > 0 ? (
              <path
                d={barPath(b.x, baseY - b.hBilled, barW, b.hBilled, 3)}
                fill="url(#fin-hatch)"
                style={{ stroke: TRACK_LINE, opacity: hover == null || hover === b.i ? 1 : 0.5 }}
                strokeWidth={1}
              />
            ) : null}
            {b.hPaid > 0 ? (
              <path d={barPath(b.x, b.yPaid, barW, b.hPaid, 3)} style={{ fill: COLLECTED, opacity: hover == null || hover === b.i ? 1 : 0.45 }} />
            ) : null}
            {b.d.cash > 0 ? (
              <g>
                {/* Halo first, so the marker stays legible on top of a bar. */}
                <line x1={b.cx - markW / 2} y1={b.yCash} x2={b.cx + markW / 2} y2={b.yCash} style={{ stroke: DOT_STROKE }} strokeWidth={4.5} strokeLinecap="round" />
                <line x1={b.cx - markW / 2} y1={b.yCash} x2={b.cx + markW / 2} y2={b.yCash} style={{ stroke: CASH, opacity: hover == null || hover === b.i ? 1 : 0.45 }} strokeWidth={2} strokeLinecap="round" />
              </g>
            ) : null}
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
            <text x={Math.max(76, Math.min(W - 76, active.cx))} y={12} textAnchor="middle" style={{ fill: STRONG, fontSize: 10.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {`${active.d.collectedLabel} / ${active.d.billedLabel}`}
            </text>
            <text x={Math.max(76, Math.min(W - 76, active.cx))} y={23} textAnchor="middle" style={{ fill: AXIS, fontSize: 9.5, fontFamily: "var(--font-mono)" }}>
              {active.d.rate == null
                ? `pa fatura · në arkë ${active.d.cashLabel}`
                : `${active.d.rate}% · në arkë ${active.d.cashLabel} · ${active.d.full}`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function Key({ kind, color, label }: { kind: "solid" | "hatch" | "rule" | "dash"; color?: string; label: string }) {
  const swatch: React.CSSProperties =
    kind === "hatch"
      ? {
          width: 10, height: 10, borderRadius: 3, flexShrink: 0,
          border: "1px solid var(--line-strong)",
          background:
            "repeating-linear-gradient(45deg, var(--line-strong) 0 2px, var(--surface-2, #F3F4F6) 2px 5px)",
        }
      : kind === "solid"
        ? { width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }
        : kind === "rule"
          ? { width: 12, height: 2, borderRadius: 2, background: color, flexShrink: 0 }
          : { width: 12, height: 0, flexShrink: 0, borderTop: `2px dashed ${color}` };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden style={swatch} />
      {label}
    </span>
  );
}
