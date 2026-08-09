"use client";

import { useState, useTransition } from "react";
import { upsertAthleteProfile } from "@/app/admin/training/actions";
import { NumericInput } from "@/components/admin/NumericInput";
import { normalizeDecimal, wPerKg } from "@/lib/training";

export type ProfileInitial = {
  ftp_w: number | null;
  ftp_updated_at: string | null;
  weight_kg: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  notes: string | null;
};

export function AthleteProfileForm({ athleteId, initial }: { athleteId: string; initial: ProfileInitial }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [ftp, setFtp] = useState(initial.ftp_w != null ? String(initial.ftp_w) : "");
  const [ftpAt, setFtpAt] = useState(initial.ftp_updated_at ?? "");
  const [weight, setWeight] = useState(initial.weight_kg != null ? String(initial.weight_kg) : "");
  const [maxHr, setMaxHr] = useState(initial.max_hr != null ? String(initial.max_hr) : "");
  const [restHr, setRestHr] = useState(initial.resting_hr != null ? String(initial.resting_hr) : "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  // normalizeDecimal: the coach may type "68,5" — parseFloat would read 68.
  const wkg = wPerKg(ftp ? parseInt(ftp, 10) : null, weight ? parseFloat(normalizeDecimal(weight)) : null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await upsertAthleteProfile(athleteId, {
        ftp_w: ftp, ftp_updated_at: ftpAt, weight_kg: weight, max_hr: maxHr, resting_hr: restHr, notes,
      });
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 1600);
    });
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <h3>Profili</h3>
        <span className="mono" style={{ fontSize: 11, color: msg?.ok === false ? "var(--err)" : "var(--ok)" }}>{msg?.text ?? ""}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>FTP (W)</label>
          <NumericInput kind="int" value={ftp} onChange={setFtp} placeholder="260" ariaLabel="FTP (W)" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>FTP përditësuar më</label>
          <input type="date" value={ftpAt} onChange={(e) => setFtpAt(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Pesha (kg)</label>
          <NumericInput kind="decimal" value={weight} onChange={setWeight} placeholder="68.5" ariaLabel="Pesha (kg)" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>HR maksimal</label>
          <NumericInput kind="int" value={maxHr} onChange={setMaxHr} placeholder="190" ariaLabel="HR maksimal (bpm)" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>HR në qetësi</label>
          <NumericInput kind="int" value={restHr} onChange={setRestHr} placeholder="48" ariaLabel="HR në qetësi (bpm)" />
        </div>
      </div>

      {wkg != null && (
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 10 }}>FTP: <strong style={{ color: "var(--ink)" }}>{wkg} W/kg</strong></div>
      )}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Shënime të trajnerit</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Objektivat, kufizimet, historiku…" />
      </div>

      {msg?.ok === false && <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 10 }}>Gabim: {msg.text}</div>}

      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-ember" disabled={pending} onClick={save}>{pending ? "Duke ruajtur…" : "Ruaj profilin"}</button>
      </div>
    </div>
  );
}
