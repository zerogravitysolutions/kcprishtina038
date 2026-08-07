"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { createRide, fetchStravaStats } from "./actions";
import { AthletePicker, type AthleteOption } from "./AthletePicker";
import { parseDurationToSeconds, formatDurationHMS, TRAINING_FOCUS } from "@/lib/training";
import { stravaActivityId } from "@/lib/strava";

type Section = { id: string; name_sq: string };

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RideBuilder({ athletes, sections }: { athletes: AthleteOption[]; sections: Section[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rideDate, setRideDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [elevation, setElevation] = useState("");
  const [stravaUrl, setStravaUrl] = useState("");
  const [resolving, startResolve] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const canEmbed = !!stravaActivityId(stravaUrl);

  // Auto-fetch on paste/change: when a Strava link is entered, pull the public
  // stats and fill Bazë. The ref guards against re-fetching the same URL (incl.
  // the canonical URL we set after a successful fetch), so no loop.
  const lastFetched = useRef("");
  useEffect(() => {
    const url = stravaUrl.trim();
    if (!url || url === lastFetched.current) return;
    if (!/strava\.(com|app\.link)/i.test(url)) return;
    const t = setTimeout(() => {
      lastFetched.current = url;
      startResolve(async () => {
        const r = await fetchStravaStats(url);
        if (r.ok) {
          lastFetched.current = r.url;
          setStravaUrl(r.url);
          if (r.distance_km != null) setDistance(String(r.distance_km));
          if (r.elevation_m != null) setElevation(String(r.elevation_m));
          if (r.moving_seconds != null) setDuration(formatDurationHMS(r.moving_seconds));
          setErr(null);
        } else setErr(r.error);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stravaUrl]);

  function submit() {
    setErr(null);
    if (!rideDate) { setErr("Zgjidh datën."); return; }
    if (!title.trim()) { setErr("Shkruaj titullin."); return; }
    if (!focus) { setErr("Zgjidh llojin e ushtrimit."); return; }
    if (selected.length === 0) { setErr("Zgjidh së paku një çiklist."); return; }
    const sec = duration.trim() ? parseDurationToSeconds(duration) : null;
    start(async () => {
      const r = await createRide({
        ride_date: rideDate,
        title, focus, location, notes,
        section_id: sectionId || null,
        athlete_ids: selected,
        distance_km: distance,
        elevation_m: elevation,
        moving_seconds: sec == null ? "" : String(sec),
        strava_url: stravaUrl,
      });
      if (r.ok) router.push(`/admin/training/${r.id}`);
      else setErr(r.error);
    });
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Data</label>
          <input type="date" value={rideDate} onChange={(e) => setRideDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Titulli <span style={{ color: "var(--accent)" }}>*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p.sh. Germia 4×2.5 VO2Max" required />
        </div>
      </div>

      {/* Strava — auto-fills Bazë on paste. */}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Strava {resolving ? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ember-deep)" }}>· po lexoj…</span> : null}</label>
        <input value={stravaUrl} onChange={(e) => setStravaUrl(e.target.value)} placeholder="Ngjit lidhjen — plotëson vetë Bazën" />
        {canEmbed && <div style={{ marginTop: 10 }}><StravaEmbed url={stravaUrl} compact /></div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Lloji i ushtrimit <span style={{ color: "var(--accent)" }}>*</span></label>
          <select name="kc-focus" autoComplete="off" value={focus} onChange={(e) => setFocus(e.target.value)} required>
            <option value="">— Zgjidh —</option>
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

      {/* Bazë — shared, inherited by each cyclist. */}
      <div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
          Bazë <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--slate)" }}>· për të gjithë · manual ose nga Strava</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span>Distanca</span><span style={{ fontSize: 9, color: "var(--slate)", letterSpacing: 0, textTransform: "none" }}>km</span></label>
            <input type="number" inputMode="decimal" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="42.5" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span>Kohëzgjatja</span><span style={{ fontSize: 9, color: "var(--slate)", letterSpacing: 0, textTransform: "none" }}>h:min</span></label>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1:25:00" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span>Ngjitja</span><span style={{ fontSize: 9, color: "var(--slate)", letterSpacing: 0, textTransform: "none" }}>m</span></label>
            <input type="number" inputMode="numeric" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="650" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Vendi</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opsionale" />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Çiklistët <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--slate)" }}>· 1 ose më shumë</span></label>
        <AthletePicker athletes={athletes} value={selected} onChange={setSelected} mode="multi" />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Shënime</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsionale" />
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-ember" disabled={pending} onClick={submit}>
          {pending ? "Duke krijuar…" : "Krijo →"}
        </button>
        <Link href="/admin/training" className="btn btn-ghost">Anulo</Link>
      </div>
    </div>
  );
}
