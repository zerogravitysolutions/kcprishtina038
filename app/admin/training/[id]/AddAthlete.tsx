"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEntry } from "../actions";
import { AthletePicker, type AthleteOption } from "../AthletePicker";

export function AddAthlete({
  rideId, athletes, existing,
}: {
  rideId: string;
  athletes: AthleteOption[];
  existing: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const id = pick[0];
    if (!id) return;
    setErr(null);
    start(async () => {
      const r = await addEntry(rideId, id);
      if (r.ok) { setPick([]); setOpen(false); router.refresh(); }
      else setErr(r.error);
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>+ Shto çiklist</button>
    );
  }

  return (
    <div style={{ border: "1px dashed var(--line-strong)", borderRadius: 12, padding: 12, background: "var(--paper)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)" }}>Shto çiklist</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setPick([]); }}>Mbyll</button>
      </div>
      <AthletePicker athletes={athletes} value={pick} onChange={setPick} mode="single" exclude={existing} />
      {err && <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 8 }}>Gabim: {err}</div>}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-ember btn-sm" disabled={pending || pick.length === 0} onClick={add}>
          {pending ? "Duke shtuar…" : "Shto"}
        </button>
      </div>
    </div>
  );
}
