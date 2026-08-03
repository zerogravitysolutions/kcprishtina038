"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateRide } from "../actions";

export type RideHeader = {
  id: string;
  kind: "group" | "solo";
  ride_date: string;
  title: string | null;
  focus: string | null;
  section_id: string | null;
  location: string | null;
  notes: string | null;
};

export function RideHeaderForm({ ride, sections }: { ride: RideHeader; sections: { id: string; name_sq: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [rideDate, setRideDate] = useState(ride.ride_date);
  const [kind, setKind] = useState<"group" | "solo">(ride.kind);
  const [title, setTitle] = useState(ride.title ?? "");
  const [focus, setFocus] = useState(ride.focus ?? "");
  const [sectionId, setSectionId] = useState(ride.section_id ?? "");
  const [location, setLocation] = useState(ride.location ?? "");
  const [notes, setNotes] = useState(ride.notes ?? "");

  const snapshot = useMemo(
    () => JSON.stringify({ rideDate, kind, title, focus, sectionId, location, notes }),
    [rideDate, kind, title, focus, sectionId, location, notes],
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => {
      setMsg(null);
      start(async () => {
        const r = await updateRide(ride.id, {
          ride_date: rideDate, kind, title, focus, location, notes,
          section_id: sectionId || null,
        });
        setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
        if (r.ok) setTimeout(() => setMsg(null), 1400);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          Detajet e stërvitjes
        </div>
        <span className="mono" style={{ fontSize: 11, color: msg?.ok === false ? "var(--err)" : "var(--ok)" }}>
          {pending ? "…" : msg?.text ?? ""}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Data</label>
          <input type="date" value={rideDate} onChange={(e) => setRideDate(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Lloji</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "group" | "solo")}>
            <option value="group">Grup</option>
            <option value="solo">Individuale</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Titulli</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opsional" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Fokusi / lloji</label>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="4×8 threshold…" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">— Asnjë —</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <label>Vendi</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opsional" />
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <label>Shënime</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </div>
  );
}
