"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { updateRide, resolveStravaUrl } from "../actions";
import { stravaActivityId } from "@/lib/strava";
import { TRAINING_FOCUS } from "@/lib/training";

export type RideHeader = {
  id: string;
  ride_date: string;
  focus: string | null;
  section_id: string | null;
  strava_url: string | null;
};

export function RideHeaderForm({ ride, sections }: { ride: RideHeader; sections: { id: string; name_sq: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [rideDate, setRideDate] = useState(ride.ride_date);
  const [focus, setFocus] = useState(ride.focus ?? "");
  const [sectionId, setSectionId] = useState(ride.section_id ?? sections[0]?.id ?? "");
  const [stravaUrl, setStravaUrl] = useState(ride.strava_url ?? "");
  const [resolving, startResolve] = useTransition();

  const canEmbed = !!stravaActivityId(stravaUrl);

  const snapshot = useMemo(
    () => JSON.stringify({ rideDate, focus, sectionId, stravaUrl }),
    [rideDate, focus, sectionId, stravaUrl],
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => {
      setMsg(null);
      start(async () => {
        const r = await updateRide(ride.id, {
          ride_date: rideDate, focus,
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

  // Auto-resolve on paste: app.link deep links need resolving to a canonical
  // activity URL before the widget can embed. Canonical URLs embed directly.
  const lastResolved = useRef("");
  useEffect(() => {
    const url = stravaUrl.trim();
    if (!url || url === lastResolved.current) return;
    if (!/strava\.app\.link\//i.test(url)) return;
    const t = setTimeout(() => {
      lastResolved.current = url;
      startResolve(async () => {
        const r = await resolveStravaUrl(url);
        if (r.ok) { lastResolved.current = r.url; setStravaUrl(r.url); setMsg(null); }
        else setMsg({ ok: false, text: r.error });
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stravaUrl]);

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
          <label>Lloji i ushtrimit</label>
          <select name="kc-focus" autoComplete="off" value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="">— Zgjidh llojin —</option>
            {focus && !TRAINING_FOCUS.some((f) => f.value === focus) ? <option value={focus}>{focus}</option> : null}
            {TRAINING_FOCUS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select name="kc-section" autoComplete="off" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      {/* Strava — one shared link for the whole exercise (embeds on paste). */}
      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Strava {resolving ? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ember-deep)" }}>· po lexoj…</span> : null}</label>
        <input
          value={stravaUrl}
          onChange={(e) => setStravaUrl(e.target.value)}
          placeholder="Ngjit lidhjen e aktivitetit"
        />
      </div>
      {canEmbed && <div style={{ marginTop: 12 }}><StravaEmbed url={stravaUrl} compact /></div>}

      {msg?.ok === false && <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 10 }}>Gabim: {msg.text}</div>}
    </div>
  );
}
