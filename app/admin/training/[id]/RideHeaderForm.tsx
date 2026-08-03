"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { updateRide, resolveStravaUrl } from "../actions";
import { stravaActivityId } from "@/lib/strava";

export type RideHeader = {
  id: string;
  ride_date: string;
  title: string | null;
  focus: string | null;
  section_id: string | null;
  location: string | null;
  notes: string | null;
  strava_url: string | null;
};

export function RideHeaderForm({ ride, sections }: { ride: RideHeader; sections: { id: string; name_sq: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [rideDate, setRideDate] = useState(ride.ride_date);
  const [title, setTitle] = useState(ride.title ?? "");
  const [focus, setFocus] = useState(ride.focus ?? "");
  const [sectionId, setSectionId] = useState(ride.section_id ?? "");
  const [location, setLocation] = useState(ride.location ?? "");
  const [notes, setNotes] = useState(ride.notes ?? "");
  const [stravaUrl, setStravaUrl] = useState(ride.strava_url ?? "");
  const [resolving, startResolve] = useTransition();

  const canEmbed = !!stravaActivityId(stravaUrl);

  const snapshot = useMemo(
    () => JSON.stringify({ rideDate, title, focus, sectionId, location, notes, stravaUrl }),
    [rideDate, title, focus, sectionId, location, notes, stravaUrl],
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => {
      setMsg(null);
      start(async () => {
        const r = await updateRide(ride.id, {
          ride_date: rideDate, title, focus, location, notes,
          section_id: sectionId || null,
          strava_url: stravaUrl,
        });
        setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
        if (r.ok) setTimeout(() => setMsg(null), 1400);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  function resolveStrava() {
    if (!stravaUrl.trim()) return;
    startResolve(async () => {
      const r = await resolveStravaUrl(stravaUrl.trim());
      if (r.ok) { setStravaUrl(r.url); setMsg(null); }
      else setMsg({ ok: false, text: r.error });
    });
  }

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
          <label>Titulli</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opsional" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">— Asnjë —</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Fokusi / lloji</label>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="4×8 threshold…" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Vendi</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opsional" />
        </div>
      </div>

      {/* Strava — one shared link for the whole exercise. */}
      <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
        <label>Lidhja Strava (e stërvitjes)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={stravaUrl}
            onChange={(e) => setStravaUrl(e.target.value)}
            placeholder="https://www.strava.com/activities/… ose strava.app.link/…"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={resolveStrava} disabled={resolving || !stravaUrl.trim()}>
            {resolving ? "…" : "Njeh lidhjen"}
          </button>
        </div>
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "4px 0 0" }}>
          Një lidhje për tërë stërvitjen. Distanca/ngjitja/koha plotësohen automatikisht te krijimi i stërvitjes (aktivitete publike).
        </p>
      </div>
      {canEmbed && <div style={{ marginTop: 12 }}><StravaEmbed url={stravaUrl} compact /></div>}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Shënime</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {msg?.ok === false && <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 10 }}>Gabim: {msg.text}</div>}
    </div>
  );
}
