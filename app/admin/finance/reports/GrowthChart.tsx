"use client";

// Membership movement per month: arrivals above the line, departures below it.
// A diverging bar chart, because "we signed six and lost five" is a shape, not
// two numbers — and the shape is the thing the owner is looking for.
//
// A tier change (Akademia I → Akademia II) closes one membership row and opens
// another, so it is NEITHER an arrival nor a departure; it is counted apart and
// marked with a diamond on the zero line, so a month of promotions can never be
// read as a month of churn. Forms, not hues, carry the meaning: solid up bars,
// hatched down bars, outlined diamonds — all still separable in print.

import { useState } from "react";

export type GrowthPoint = {
  /** Short month label, e.g. "Gus". */
  label: string;
  /** Full month name for the tooltip. */
  full: string;
  /** New memberships that are not the second half of a tier change. */
  joined: number;
  /** Memberships closed that are not the first half of a tier change. */
  left: number;
  /** Tier changes: same member, one row closed and the next opened. */
  changed: number;
  /** Paying members at the end of the month. */
  paying: number;
  /** Change in paying members against the month before. */
  net: number;
};

const JOIN = "#16A34A";
const LEAVE = "#DC2626";
const STRONG = "var(--chart-strong, #101828)";
const AXIS = "var(--chart-axis, #98A2B3)";
const GRID = "var(--chart-grid, rgba(16,24,40,.08))";
const LINE = "var(--line-strong, rgba(16,24,40,.16))";
const DOT_STROKE = "var(--chart-bg, #fff)";

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export function MembershipFlow({ data }: { data: GrowthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 200, padT = 30, padB = 34, padX = 12;
  const plotH = H - padT - padB;
  const zeroY = padT + plotH / 2;
  const half = plotH / 2;
  const n = Math.max(1, data.length);
  const band = (W - padX * 2) / n;
  const barW = Math.min(24, band * 0.5);
  // Guarded at 1: a window with no movement at all must still draw an axis
  // rather than divide by zero.
  const max = Math.max(1, ...data.map((d) => Math.max(d.joined, d.left)));

  const bars = data.map((d, i) => {
    const x = padX + i * band + (band - barW) / 2;
    return {
      d, i, x,
      cx: x + barW / 2,
      hUp: (d.joined / max) * half,
      hDown: (d.left / max) * half,
    };
  });

  const active = hover != null ? bars[hover] : null;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8, fontSize: 11.5, color: "var(--text-3)" }}>
        <Key kind="solid" color={JOIN} label="Anëtarësi të reja" />
        <Key kind="hatch" color={LEAVE} label="Anëtarësi të mbyllura" />
        <Key kind="diamond" label="Ndryshim plani (jo largim)" />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Anëtarësi të reja dhe të mbyllura sipas muajve"
      >
        <defs>
          <pattern id="fin-growth-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#fff" fillOpacity={0.001} />
            <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: LEAVE }} strokeWidth={3} />
          </pattern>
        </defs>
        <line x1={padX} y1={padT} x2={W - padX} y2={padT} style={{ stroke: GRID }} strokeWidth={1} />
        <line x1={padX} y1={H - padB} x2={W - padX} y2={H - padB} style={{ stroke: GRID }} strokeWidth={1} />
        {bars.map((b) => (
          <g key={b.i} onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover((h) => (h === b.i ? null : h))}>
            <title>
              {`${b.d.full}: ${b.d.joined} të reja, ${b.d.left} të mbyllura, ${b.d.changed} ndryshime plani · ${b.d.paying} anëtarë me pagesë`}
            </title>
            <rect x={padX + b.i * band} y={padT} width={band} height={plotH} fill="transparent" />
            {b.hUp > 0 ? (
              <path d={barPath(b.x, zeroY - b.hUp, barW, b.hUp, 3)} style={{ fill: JOIN, opacity: hover == null || hover === b.i ? 1 : 0.45 }} />
            ) : null}
            {b.hDown > 0 ? (
              <g style={{ opacity: hover == null || hover === b.i ? 1 : 0.45 }}>
                <rect x={b.x} y={zeroY} width={barW} height={b.hDown} rx={3} fill="url(#fin-growth-hatch)" />
                <rect x={b.x} y={zeroY} width={barW} height={b.hDown} rx={3} fill="none" style={{ stroke: LEAVE }} strokeWidth={1} />
              </g>
            ) : null}
            {b.d.changed > 0 ? (
              <path
                d={`M${b.cx},${zeroY - 5.5} L${b.cx + 5.5},${zeroY} L${b.cx},${zeroY + 5.5} L${b.cx - 5.5},${zeroY} Z`}
                fill={DOT_STROKE}
                style={{ stroke: STRONG }}
                strokeWidth={1.4}
              />
            ) : null}
            <text x={b.cx} y={H - 12} textAnchor="middle" style={{ fill: AXIS, fontSize: 9, fontFamily: "var(--font-mono)" }}>{b.d.label}</text>
          </g>
        ))}
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} style={{ stroke: LINE }} strokeWidth={1.2} />
        {active && (
          <g pointerEvents="none">
            <text x={Math.max(70, Math.min(W - 70, active.cx))} y={12} textAnchor="middle" style={{ fill: STRONG, fontSize: 10.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {`+${active.d.joined} / −${active.d.left}`}
            </text>
            <text x={Math.max(70, Math.min(W - 70, active.cx))} y={23} textAnchor="middle" style={{ fill: AXIS, fontSize: 9.5, fontFamily: "var(--font-mono)" }}>
              {`${active.d.full} · ${active.d.paying} me pagesë`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function Key({ kind, color, label }: { kind: "solid" | "hatch" | "diamond"; color?: string; label: string }) {
  const swatch: React.CSSProperties =
    kind === "solid"
      ? { width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }
      : kind === "hatch"
        ? {
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            border: `1px solid ${color}`,
            background: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 5px)`,
          }
        : {
            width: 9, height: 9, flexShrink: 0, transform: "rotate(45deg)",
            border: "1.4px solid var(--text-1, #101828)", background: "var(--surface-1, #fff)",
          };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden style={swatch} />
      {label}
    </span>
  );
}
