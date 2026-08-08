"use client";

// Hand-rolled SVG/HTML charts for the training monitor. Single-series magnitude
// and trend forms (no legend needed — the panel title names the series), one
// design-system hue, recessive axes, rounded bar ends, hover tooltips, and a
// direct label on the most recent point. No chart library.

import { useState } from "react";

export type Point = { label: string; value: number; display: string };

// Theme-aware via CSS vars so the same charts read on the dark admin AND the
// light portal. admin.css defines the dark values; the fallbacks here are the
// original light-theme colours the portal inherits.
const SERIES = "var(--chart-series, #C25A2D)";
const STRONG = "var(--chart-strong, #2A3858)";
const AXIS = "var(--chart-axis, #A4ADB6)";
const GRID = "var(--chart-grid, rgba(15,26,46,0.10))";
const DOT_STROKE = "var(--chart-bg, #fff)";

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Vertical bars for a time series (e.g. weekly volume). */
export function ColumnChart({ data, color = SERIES, unitHint }: { data: Point[]; color?: string; unitHint?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 170, padT = 18, padB = 28, padX = 10;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const n = Math.max(1, data.length);
  const band = (W - padX * 2) / n;
  const barW = Math.min(30, band * 0.62);
  const max = Math.max(1, ...data.map((d) => d.value));
  const labelStep = Math.ceil(n / 9);

  const bars = data.map((d, i) => {
    const h = (d.value / max) * plotH;
    const x = padX + i * band + (band - barW) / 2;
    const y = baseY - h;
    return { d, i, x, y, h, cx: x + barW / 2 };
  });

  const active = hover != null ? bars[hover] : bars[bars.length - 1];
  const showTip = hover != null && active;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
      <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} style={{ stroke: GRID }} strokeWidth={1} />
      {bars.map((b) => (
        <g key={b.i} onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover((h) => (h === b.i ? null : h))}>
          <title>{`${b.d.label}: ${b.d.display}`}</title>
          {/* full-height hit target */}
          <rect x={padX + b.i * band} y={padT} width={band} height={plotH + 6} fill="transparent" />
          <path d={barPath(b.x, b.y, barW, b.h, 3)} style={{ fill: color, opacity: hover == null || hover === b.i ? 1 : 0.45 }} />
          {(b.i % labelStep === 0 || b.i === n - 1) && (
            <text x={b.cx} y={H - 10} textAnchor="middle" style={{ fill: AXIS, fontSize: 9, fontFamily: "var(--font-mono)" }}>{b.d.label}</text>
          )}
        </g>
      ))}
      {/* direct label on the most recent bar (when idle) */}
      {hover == null && bars.length > 0 && bars[bars.length - 1].d.value > 0 && (
        <text x={bars[bars.length - 1].cx} y={bars[bars.length - 1].y - 6} textAnchor="middle" style={{ fill: STRONG, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {bars[bars.length - 1].d.display}
        </text>
      )}
      {showTip && (
        <g pointerEvents="none">
          <text
            x={Math.max(40, Math.min(W - 40, active.cx))}
            y={Math.max(12, active.y - 8)}
            textAnchor="middle"
            style={{ fill: STRONG, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)" }}
          >
            {active.d.display}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Single-series trend line (e.g. 20-min power over time). */
export function LineChart({ data, color = SERIES }: { data: Point[]; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 170, padT = 16, padB = 28, padL = 12, padR = 40;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const n = data.length;
  if (n === 0) return null;

  const vals = data.map((d) => d.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const xAt = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const yAt = (v: number) => baseY - ((v - min) / (max - min)) * plotH;

  const pts = data.map((d, i) => ({ d, i, x: xAt(i), y: yAt(d.value) }));
  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${padL},${baseY} ${line} ${pts[pts.length - 1].x},${baseY}`;
  const labelStep = Math.ceil(n / 7);
  const last = pts[pts.length - 1];
  const active = hover != null ? pts[hover] : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={padL} y1={padT + t * plotH} x2={W - padR} y2={padT + t * plotH} style={{ stroke: GRID }} strokeWidth={1} />
      ))}
      <polygon points={area} style={{ fill: color, opacity: 0.1 }} />
      <polyline points={line} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <g key={p.i} onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover((h) => (h === p.i ? null : h))}>
          <title>{`${p.d.label}: ${p.d.display}`}</title>
          <circle cx={p.x} cy={p.y} r={hover === p.i ? 5 : 3.4} style={{ fill: color, stroke: DOT_STROKE }} strokeWidth={1.5} />
          {(p.i % labelStep === 0 || p.i === n - 1) && (
            <text x={p.x} y={H - 10} textAnchor="middle" style={{ fill: AXIS, fontSize: 9, fontFamily: "var(--font-mono)" }}>{p.d.label}</text>
          )}
        </g>
      ))}
      {/* most-recent value, always labelled at the right */}
      <text x={last.x + 6} y={last.y + 3} style={{ fill: STRONG, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{last.d.display}</text>
      {active && (
        <text x={Math.max(30, Math.min(W - 30, active.x))} y={Math.max(11, active.y - 9)} textAnchor="middle" style={{ fill: STRONG, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {active.d.display}
        </text>
      )}
    </svg>
  );
}

/** Horizontal labelled bars for a per-entity comparison (e.g. km per rider). */
export function RowBars({ data, color = SERIES }: { data: Point[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Pa të dhëna për këtë periudhë.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(84px, 150px) 1fr auto", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.label}>{d.label}</div>
          <div style={{ background: "var(--paper-2)", borderRadius: 6, height: 14 }}>
            <div style={{ width: `${Math.max(3, (d.value / max) * 100)}%`, height: "100%", background: color, borderRadius: 6 }} />
          </div>
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", minWidth: 46, textAlign: "right" }}>{d.display}</div>
        </div>
      ))}
    </div>
  );
}
