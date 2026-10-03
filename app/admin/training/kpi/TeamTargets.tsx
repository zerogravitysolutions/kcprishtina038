"use client";

import { useState, useTransition } from "react";
import { NumericInput } from "@/components/admin/NumericInput";
import { setTeamTargets } from "./actions";

/**
 * Weekly team targets and the entry point for per-cyclist monthly power goals.
 * Actual hours, climbing and 20-minute power come from registered trainings.
 */
export function TeamTargets({
  current, children,
}: {
  current: { weekly_hours: number | string | null; weekly_elevation_m: number | null };
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hours, setHours] = useState(current.weekly_hours != null ? String(Number(current.weekly_hours)) : "");
  const [elevation, setElevation] = useState(current.weekly_elevation_m != null ? String(current.weekly_elevation_m) : "");

  function save() {
    setMsg(null);
    start(async () => {
      const r = await setTeamTargets({ weeklyHours: hours, weeklyElevation: elevation });
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 2000);
    });
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="kpi-target-layout">
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: 0 }} className="field">
              <label htmlFor="kpi-hours" style={{ marginBottom: 4 }}>Targeti: orë stërvitje / javë</label>
              <NumericInput id="kpi-hours" kind="decimal" value={hours} onChange={setHours} placeholder="8" ariaLabel="Orë stërvitje në javë" />
            </div>
            <div style={{ flex: "1 1 140px", minWidth: 0 }} className="field">
              <label htmlFor="kpi-elev" style={{ marginBottom: 4 }}>Targeti: ngjitje (m) / javë</label>
              <NumericInput id="kpi-elev" kind="int" value={elevation} onChange={setElevation} placeholder="3000" ariaLabel="Ngjitje në metra në javë" />
            </div>
            <button type="button" className="btn btn-ember" disabled={pending} onClick={save} style={{ minHeight: 44, flex: "0 0 auto" }}>
              {pending ? "Duke ruajtur…" : "Ruaj"}
            </button>
          </div>
          {msg && <div aria-live="polite" className={msg.ok ? "mono" : "mm-msg err"} style={{ marginTop: 10, color: msg.ok ? "var(--ok)" : undefined, fontSize: msg.ok ? 12 : undefined }}>{msg.text}</div>}
          <p className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "10px 0 0", lineHeight: 1.6 }}>
            Një target për gjithë ekipin, i matur për secilin çiklist veç e veç. Orët dhe ngjitja merren nga stërvitjet e regjistruara.
          </p>
        </div>
        {children ? <div className="kpi-ftp-action">
          <div className="kpi-ftp-action__title">Fuqia 20-min · targetet mujore</div>
          <p>Cakto targetin FTP për secilin çiklist aktiv.</p>
          {children}
        </div> : null}
      </div>
    </div>
  );
}
