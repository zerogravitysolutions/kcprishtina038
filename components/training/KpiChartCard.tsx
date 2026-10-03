"use client";

import { useState } from "react";
import { ColumnChart, type Point } from "@/app/admin/training/charts";

/**
 * One KPI, one chart: weekly or monthly with a toggle. `weeks` is null for a
 * KPI that only makes sense per month (20-minute power), which hides the toggle.
 */
export function KpiChartCard({
  title, weeks, months, targetUnit,
}: {
  title: string;
  weeks: Point[] | null;
  months: Point[];
  targetUnit: string;
}) {
  const [mode, setMode] = useState<"week" | "month">(weeks ? "week" : "month");
  const data = mode === "week" && weeks ? weeks : months;
  const chip = (m: "week" | "month", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      style={{
        padding: "6px 12px", minHeight: 32, borderRadius: 999, cursor: "pointer", fontSize: 12,
        fontFamily: "var(--font-mono)", letterSpacing: ".04em",
        border: `1px solid ${mode === m ? "var(--ember, #C25A2D)" : "color-mix(in oklab, var(--ink, #0f1a2e) 14%, transparent)"}`,
        background: mode === m ? "color-mix(in oklab, var(--ember, #C25A2D) 12%, var(--white, #fff))" : "transparent",
        color: "var(--ink, #0f1a2e)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        background: "var(--white, #fff)", borderRadius: 16, padding: 18, minWidth: 0,
        border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)",
        boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: 0 }}>{title}</h3>
        {weeks ? <div style={{ display: "flex", gap: 6 }}>{chip("week", "Javë")}{chip("month", "Muaj")}</div> : (
          <span className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)" }}>më e mira e muajit</span>
        )}
      </div>
      <ColumnChart data={data} labels="all" targetUnit={targetUnit} />
    </div>
  );
}
