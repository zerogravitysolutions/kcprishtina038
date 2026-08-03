"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { updateRide, applyBaseToAll, resolveStravaUrl } from "../actions";
import { parseDurationToSeconds, formatDurationHMS } from "@/lib/training";
import { stravaActivityId } from "@/lib/strava";

export type RideHeader = {
  id: string;
  ride_date: string;
  title: string | null;
  focus: string | null;
  section_id: string | null;
  location: string | null;
  notes: string | null;
  distance_km: number | null;
  moving_seconds: number | null;
  elevation_m: number | null;
  strava_url: string | null;
};

export function RideHeaderForm({ ride, sections }: { ride: RideHeader; sections: { id: string; name_sq: string }[] }) {
  const [pending, start] = useTransition();
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [rideDate, setRideDate] = useState(ride.ride_date);
  const [title, setTitle] = useState(ride.title ?? "");
  const [focus, setFocus] = useState(ride.focus ?? "");
  const [sectionId, setSectionId] = useState(ride.section_id ?? "");
  const [location, setLocation] = useState(ride.location ?? "");
  const [notes, setNotes] = useState(ride.notes ?? "");
  const [distance, setDistance] = useState(ride.distance_km != null ? String(ride.distance_km) : "");
  const [duration, setDuration] = useState(formatDurationHMS(ride.moving_seconds));
  const [elevation, setElevation] = useState(ride.elevation_m != null ? String(ride.elevation_m) : "");
  const [stravaUrl, setStravaUrl] = useState(ride.strava_url ?? "");
  const [showEmbed, setShowEmbed] = useState(false);
  const [resolving, startResolve] = useTransition();

  const durationSeconds = () => (duration.trim() ? String(parseDurationToSeconds(duration) ?? "") : "");
  const canEmbed = !!stravaActivityId(stravaUrl);

  const snapshot = useMemo(
    () => JSON.stringify({ rideDate, title, focus, sectionId, location, notes, distance, duration, elevation, stravaUrl }),
    [rideDate, title, focus, sectionId, location, notes, distance, duration, elevation, stravaUrl],
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
          distance_km: distance, elevation_m: elevation, moving_seconds: durationSeconds(),
          strava_url: stravaUrl,
        });
        setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
        if (r.ok) setTimeout(() => setMsg(null), 1400);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  async function applyAll() {
    setApplying(true);
    setMsg(null);
    const r = await applyBaseToAll(ride.id, {
      distance_km: distance, elevation_m: elevation, moving_seconds: durationSeconds(),
    });
    setApplying(false);
    if (r.ok) window.location.reload();
    else setMsg({ ok: false, text: r.error });
  }

  function resolveStrava() {
    if (!stravaUrl.trim()) return;
    startResolve(async () => {
      const r = await resolveStravaUrl(stravaUrl.trim());
      if (r.ok) { setStravaUrl(r.url); setShowEmbed(true); setMsg(null); }
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

      {/* Bazë — inherited by each cyclist; "apply to all" pushes it onto every entry. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
            Bazë (e përbashkët)
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={applyAll} disabled={applying}>
            {applying ? "Duke aplikuar…" : "Apliko te të gjithë çiklistët"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Distanca (km)</label>
            <input type="number" inputMode="decimal" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="42.5" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Kohëzgjatja</label>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1:25:00" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ngjitja (m)</label>
            <input type="number" inputMode="numeric" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="650" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
        </div>
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "6px 0 0" }}>
          Baza bartet automatikisht te çiklistët e rinj. “Apliko te të gjithë” e vendos edhe te ata ekzistues.
        </p>
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
          {canEmbed && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEmbed((s) => !s)}>
              {showEmbed ? "Fshih" : "Shiko"}
            </button>
          )}
        </div>
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "4px 0 0" }}>
          Një lidhje për tërë stërvitjen. Marrja automatike e numrave nga Strava kërkon lidhjen e llogarisë (fazë e mëvonshme).
        </p>
      </div>
      {showEmbed && canEmbed && <div style={{ marginTop: 12 }}><StravaEmbed url={stravaUrl} /></div>}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Shënime</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {msg?.ok === false && <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 10 }}>Gabim: {msg.text}</div>}
    </div>
  );
}
