"use client";

import Link from "next/link";
import { useState } from "react";
import { fmt, toHours } from "@/lib/training";

export type ProgressRow = {
  athlete_id: string;
  name: string;
  section: string | null;
  participations: number;
  total_km: number;
  total_seconds: number;
  total_elevation: number;
  avg_hr: number | null;
  avg_ftp: number | null;
  avg_power: number | null;
  avg_5m: number | null;
  avg_10m: number | null;
  avg_20m: number | null;
};

type Col = {
  key: string;
  label: string;
  numeric: boolean;
  value: (r: ProgressRow) => number | string | null;
  render: (r: ProgressRow) => string;
};

const COLS: Col[] = [
  { key: "name", label: "Çiklisti", numeric: false, value: (r) => r.name, render: (r) => r.name },
  { key: "participations", label: "Pjesëmarrje", numeric: true, value: (r) => r.participations, render: (r) => String(r.participations) },
  { key: "total_km", label: "KM", numeric: true, value: (r) => r.total_km, render: (r) => (r.total_km > 0 ? fmt(r.total_km, 0) : "—") },
  { key: "total_seconds", label: "Orë", numeric: true, value: (r) => r.total_seconds, render: (r) => (r.total_seconds > 0 ? fmt(toHours(r.total_seconds), 1) : "—") },
  { key: "total_elevation", label: "Ngjitje", numeric: true, value: (r) => r.total_elevation, render: (r) => (r.total_elevation > 0 ? fmt(r.total_elevation, 0) : "—") },
  { key: "avg_hr", label: "HR mes", numeric: true, value: (r) => r.avg_hr, render: (r) => (r.avg_hr != null ? fmt(r.avg_hr, 0) : "—") },
  { key: "avg_ftp", label: "FTP mes", numeric: true, value: (r) => r.avg_ftp, render: (r) => (r.avg_ftp != null ? fmt(r.avg_ftp, 0) : "—") },
  { key: "avg_power", label: "Fuqia mes", numeric: true, value: (r) => r.avg_power, render: (r) => (r.avg_power != null ? fmt(r.avg_power, 0) : "—") },
  { key: "avg_5m", label: "5m mes", numeric: true, value: (r) => r.avg_5m, render: (r) => (r.avg_5m != null ? fmt(r.avg_5m, 0) : "—") },
  { key: "avg_10m", label: "10m mes", numeric: true, value: (r) => r.avg_10m, render: (r) => (r.avg_10m != null ? fmt(r.avg_10m, 0) : "—") },
  { key: "avg_20m", label: "20m mes", numeric: true, value: (r) => r.avg_20m, render: (r) => (r.avg_20m != null ? fmt(r.avg_20m, 0) : "—") },
];

export function ProgressTable({ rows }: { rows: ProgressRow[] }) {
  const [sortKey, setSortKey] = useState("participations");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const col = COLS.find((c) => c.key === sortKey) ?? COLS[1];
  const sorted = rows.slice().sort((a, b) => {
    const av = col.value(a);
    const bv = col.value(b);
    if (col.numeric) {
      const an = typeof av === "number" ? av : null;
      const bn = typeof bv === "number" ? bv : null;
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return dir === "asc" ? an - bn : bn - an;
    }
    const cmp = String(av).localeCompare(String(bv), "sq");
    return dir === "asc" ? cmp : -cmp;
  });

  function onSort(key: string, numeric: boolean) {
    if (sortKey === key) { setDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(key);
    setDir(numeric ? "desc" : "asc");
  }

  const statCols = COLS.filter((c) => c.numeric);

  return (
    <>
      {/* Mobile: sort control + one card per cyclist */}
      <div className="pt-mobile">
        <div className="pt-sort">
          <span className="pt-sort-label">Rendit</span>
          <select
            value={sortKey}
            onChange={(e) => { const c = COLS.find((x) => x.key === e.target.value); setSortKey(e.target.value); setDir(c && !c.numeric ? "asc" : "desc"); }}
          >
            {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button type="button" className="pt-dir" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} aria-label="Kthe renditjen">
            {dir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className="pt-empty">Asnjë çiklist.</div>
        ) : (
          sorted.map((r) => {
            const visible = statCols.filter((c) => c.render(r) !== "—");
            return (
              <div className="pt-card" key={r.athlete_id}>
                <div className="pt-card-name"><Link href={`/admin/athletes/${r.athlete_id}`}>{r.name}</Link></div>
                <div className="pt-card-stats">
                  {visible.map((c) => (
                    <div className="pt-stat" key={c.key}>
                      <span className="k">{c.label}</span>
                      <span className="v">{c.render(r)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: sortable table */}
      <div className="pt-desktop scroll-x">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key, c.numeric)}
                    style={{ cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", textAlign: c.numeric ? "right" : "left" }}
                  >
                    {c.label}{sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={COLS.length} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Asnjë çiklist.</td></tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.athlete_id}>
                    {COLS.map((c) => (
                      c.key === "name"
                        ? <td key={c.key}><Link href={`/admin/athletes/${r.athlete_id}`} style={{ fontWeight: 600 }}>{r.name}</Link></td>
                        : <td key={c.key} className="mono" style={{ textAlign: "right" }}>{c.render(r)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
