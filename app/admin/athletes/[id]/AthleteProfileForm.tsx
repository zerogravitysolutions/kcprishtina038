"use client";

import { useState, useTransition } from "react";
import { saveAthleteNotes } from "@/app/admin/training/actions";
import { fmt, wPerKg } from "@/lib/training";
import type { DerivedFtp, DerivedMaxHr } from "@/lib/athlete-metrics";

export type AthleteProfileValues = {
  ftp: DerivedFtp | null;
  maxHr: DerivedMaxHr | null;
  weightKg: number | null;
  weightSource: "strava" | "profile" | null;
  notes: string | null;
};

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/** FTP, max HR and weight come from the rider's activities and Strava, so
 * they are shown, not typed. The coach keeps notes here. */
export function AthleteProfileForm({ athleteId, values }: { athleteId: string; values: AthleteProfileValues }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState(values.notes ?? "");
  const wkg = wPerKg(values.ftp?.watts ?? null, values.weightKg);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveAthleteNotes(athleteId, notes);
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 1600);
    });
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <h3>Profili</h3>
        <span className="kicker">Nga aktivitetet</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
        <Value label="FTP" value={values.ftp ? `${values.ftp.watts} W` : "—"}
          sub={values.ftp ? values.ftp.source === "estimate"
            ? `95% e ${values.ftp.best20} W (20 min) · ${shortDate(values.ftp.date)}`
            : `Nga Strava · ${shortDate(values.ftp.date)}` : "Pa të dhëna fuqie"} />
        <Value label="W/kg" value={wkg != null ? fmt(wkg, 2) : "—"} sub={wkg != null ? "FTP / pesha" : "Duhet FTP dhe pesha"} />
        <Value label="Pesha" value={values.weightKg != null ? `${fmt(values.weightKg, 1)} kg` : "—"}
          sub={values.weightSource === "strava" ? "Nga Strava" : values.weightSource === "profile" ? "Nga profili i çiklistit" : "E pavendosur"} />
        <Value label="HR maksimal" value={values.maxHr ? `${values.maxHr.bpm} bpm` : "—"}
          sub={values.maxHr ? `Më e larta në 12 muaj · ${shortDate(values.maxHr.date)}` : "Pa të dhëna HR"} />
      </div>

      <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
        <label>Shënime të trajnerit</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Objektivat, kufizimet, historiku…" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button type="button" className="btn btn-ember" disabled={pending} onClick={save}>{pending ? "Duke ruajtur…" : "Ruaj shënimet"}</button>
        {msg && <span className="mono" style={{ fontSize: 12, color: msg.ok ? "var(--ok)" : "var(--err)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

function Value({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}
