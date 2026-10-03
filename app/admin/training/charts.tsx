"use client";

// Hand-rolled SVG/HTML charts for the training monitor. Single-series magnitude
// and trend forms (no legend needed — the panel title names the series), one
// design-system hue, recessive axes, rounded bar ends, hover tooltips, and a
// direct label on the most recent point. No chart library.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * `target` (optional) draws a dashed marker across that bar and turns a FINISHED
 * bar green once it reaches it; `current` marks a period still in progress,
 * drawn lighter and never judged as missed.
 */
export type Point = {
  label: string; value: number; display: string;
  /** Compact text printed on the bar itself with labels="all" (falls back to `display`). */
  short?: string;
  target?: number | null; current?: boolean;
};

// Theme-aware via CSS vars so the same charts read on the dark admin AND the
// light portal. admin.css defines the dark values; the fallbacks here are the
// original light-theme colours the portal inherits.
const SERIES = "var(--chart-series, #C25A2D)";
const STRONG = "var(--chart-strong, #2A3858)";
const AXIS = "var(--chart-axis, #A4ADB6)";
const GRID = "var(--chart-grid, rgba(15,26,46,0.10))";
const DOT_STROKE = "var(--chart-bg, #fff)";
const HIT = "var(--ok, #16A34A)";
const TARGET = "var(--ink-2, #4A5568)";

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/**
 * Vertical bars for a time series (e.g. weekly volume).
 *
 * With `labels="all"` every bar carries its own value (phones have no hover),
 * and a target is drawn as ONE stepped dashed line labelled at the right edge
 * ("8 orë") instead of a tick per bar — so a change of target reads as a step.
 * Bars are green once a FINISHED period reaches its target; the running period
 * is drawn lighter and never judged.
 */
export function ColumnChart({
  data, color = SERIES, labels = "last", targetUnit = "", height,
}: {
  data: Point[]; color?: string; unitHint?: string;
  labels?: "last" | "all";
  /** SVG viewBox height; taller when the chart sits beside a long list. */
  height?: number;
  /** Appended to the target label at the line's right end, e.g. "orë". */
  targetUnit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = labels === "all";

  // With labels="all" the drawing is sized to its real container so the numbers
  // are true-size text, not a 560px drawing squeezed to ~330px on a phone; and a
  // narrow screen shows the latest 8 bars so the labels do not collide.
  const svgRef = useRef<SVGSVGElement>(null);
  const [vw, setVw] = useState(560);
  useEffect(() => {
    if (labels !== "all") return;
    const el = svgRef.current;
    if (!el) return;
    // The svg's own width (it is width:100% of its container), not the container's:
    // a padded card would over-measure and shrink the text again.
    const measure = () => setVw(Math.max(260, Math.min(760, Math.round(el.getBoundingClientRect().width))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [labels]);
  const series = all && vw < 420 ? data.slice(-8) : data;

  const hasTarget = series.some((d) => d.target != null && d.target > 0);
  const W = all ? vw : 560, H = height ?? (all ? 190 : 170), padT = all ? 26 : 18, padB = 28, padX = 10;
  const padR = all && hasTarget ? 46 : 0;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const n = Math.max(1, series.length);
  const band = (W - padX * 2 - padR) / n;
  const barW = Math.min(30, band * 0.62);
  const max = Math.max(1, ...series.map((d) => Math.max(d.value, d.target ?? 0)));
  // labels="all": a label needs ~54px; thin them out from the LATEST bar backwards
  // so the newest period is always named and none touch.
  const labelStep = all ? Math.max(1, Math.ceil(54 / band)) : Math.ceil(n / 9);
  const showLabel = (i: number) => (all ? (n - 1 - i) % labelStep === 0 : i % labelStep === 0 || i === n - 1);
  const yOf = (v: number) => baseY - (v / max) * plotH;

  const bars = series.map((d, i) => {
    const h = (d.value / max) * plotH;
    const x = padX + i * band + (band - barW) / 2;
    const y = baseY - h;
    return { d, i, x, y, h, cx: x + barW / 2 };
  });

  // Which bars print their value: walk from the NEWEST bar back and skip any label
  // that would touch the one already placed (~7px per character + a small gap).
  const valueShown = new Set<number>();
  let leftEdge = Infinity;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (!(b.d.value > 0)) continue;
    const halfW = ((b.d.short ?? b.d.display).length * 7) / 2;
    if (b.cx + halfW + 3 <= leftEdge) { valueShown.add(i); leftEdge = b.cx - halfW; }
  }

  const active = hover != null ? bars[hover] : bars[bars.length - 1];
  const showTip = hover != null && active;

  // The target as a step line through the bands that have one.
  const stepPts: string[] = [];
  if (all) {
    series.forEach((d, i) => {
      if (d.target == null || d.target <= 0) return;
      const y = yOf(d.target);
      stepPts.push(`${padX + i * band},${y}`, `${padX + (i + 1) * band},${y}`);
    });
  }
  const lastT = [...series].reverse().find((d) => d.target != null && d.target > 0);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
      <line x1={padX} y1={baseY} x2={W - padX - padR} y2={baseY} style={{ stroke: GRID }} strokeWidth={1} />
      {all && [0.5, 1].map((t) => (
        <line key={t} x1={padX} y1={baseY - t * plotH} x2={W - padX - padR} y2={baseY - t * plotH} style={{ stroke: GRID }} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
      ))}
      {bars.map((b) => (
        <g key={b.i} onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover((h) => (h === b.i ? null : h))}>
          <title>{`${b.d.label}: ${b.d.display}`}</title>
          {/* full-height hit target */}
          <rect x={padX + b.i * band} y={padT} width={band} height={plotH + 6} fill="transparent" />
          <path
            d={barPath(b.x, b.y, barW, b.h, 3)}
            style={{
              fill: !b.d.current && b.d.target != null && b.d.target > 0 && b.d.value >= b.d.target ? HIT : color,
              opacity: (hover == null || hover === b.i ? 1 : 0.45) * (b.d.current ? 0.55 : 1),
            }}
          />
          {!all && b.d.target != null && b.d.target > 0 && (
            <line
              x1={padX + b.i * band + 2} x2={padX + (b.i + 1) * band - 2}
              y1={yOf(b.d.target)} y2={yOf(b.d.target)}
              style={{ stroke: TARGET }} strokeWidth={1.5} strokeDasharray="4 3"
            />
          )}
          {showLabel(b.i) && (
            <text x={b.cx} y={H - 10} textAnchor="middle" style={{ fill: b.d.current ? STRONG : AXIS, fontSize: all ? 10 : 9, fontWeight: b.d.current ? 700 : 400, fontFamily: "var(--font-mono)" }}>{b.d.label}</text>
          )}
        </g>
      ))}
      {all && stepPts.length > 0 && (
        <>
          <polyline points={stepPts.join(" ")} fill="none" style={{ stroke: TARGET }} strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
          {lastT?.target != null && (
            <text x={W - padX - padR + 5} y={yOf(lastT.target) + 3.5} style={{ fill: TARGET, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {`${lastT.target}${targetUnit ? " " + targetUnit : ""}`}
            </text>
          )}
        </>
      )}
      {/* value on every bar: drawn LAST with a halo, so the target line passes behind the numbers */}
      {all && bars.map((b) => {
        if (!(b.d.value > 0) || !valueShown.has(b.i)) return null;
        // the label spans roughly [y-12, y]; if the target line runs through it, sit above the line
        let ly = b.y - 6;
        const ty = b.d.target != null && b.d.target > 0 ? yOf(b.d.target) : null;
        if (ty != null && ty >= ly - 12 && ty <= ly + 2) ly = ty - 5;
        return (
        <text
          key={`v${b.i}`} x={b.cx} y={ly} textAnchor="middle" pointerEvents="none"
          style={{
            fill: b.d.current ? AXIS : STRONG, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
            stroke: DOT_STROKE, strokeWidth: 3.5, paintOrder: "stroke", strokeLinejoin: "round",
          }}
        >
          {b.d.short ?? b.d.display}
        </text>
        );
      })}
      {/* direct label on the most recent bar (when idle) */}
      {!all && hover == null && bars.length > 0 && bars[bars.length - 1].d.value > 0 && (
        <text x={bars[bars.length - 1].cx} y={bars[bars.length - 1].y - 6} textAnchor="middle" style={{ fill: STRONG, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {bars[bars.length - 1].d.display}
        </text>
      )}
      {showTip && !all && (
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

/**
 * One horizontal bar per cyclist against a target: the dashed tick is the
 * target, the bar turns green at 100%. `target` may differ per row (20-min
 * power is set per athlete). `current` rows are still in progress.
 */
export type TargetRow = {
  label: string;
  value: number;
  target: number | null;
  display: string;
  href?: string;
  current?: boolean;
};

export function TargetBars({ data, empty }: { data: TargetRow[]; empty?: string }) {
  if (data.length === 0) {
    return <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{empty ?? "Pa të dhëna për këtë periudhë."}</div>;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target ?? 0)));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {data.map((d, i) => {
        const hit = d.target != null && d.target > 0 && d.value >= d.target;
        const p = d.target != null && d.target > 0 ? Math.round((d.value / d.target) * 100) : null;
        const name = d.href
          ? <Link href={d.href as never} style={{ color: "inherit" }}>{d.label}</Link>
          : d.label;
        return (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 12.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.label}>{name}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", flexShrink: 0 }}>
                {d.display}{p != null ? <span style={{ color: hit ? HIT : "var(--ink-3)" }}> · {p}%</span> : null}
              </div>
            </div>
            <div style={{ position: "relative", background: "var(--paper-2, #eef1f4)", borderRadius: 6, height: 12 }}>
              <div style={{ width: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%`, height: "100%", background: hit && !d.current ? HIT : SERIES, opacity: d.current ? 0.6 : 1, borderRadius: 6 }} />
              {d.target != null && d.target > 0 && (
                <div title={`Targeti: ${d.target}`} style={{ position: "absolute", top: -3, bottom: -3, left: `${(d.target / max) * 100}%`, borderLeft: `2px dashed ${TARGET}` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
