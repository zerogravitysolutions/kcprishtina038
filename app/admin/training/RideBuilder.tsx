"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { createRide, fetchStravaStats } from "./actions";
import { AthletePicker, type AthleteOption } from "./AthletePicker";
import { parseDurationToSeconds, formatDurationHMS } from "@/lib/training";
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
  const [sectionId, setSectionId] = useState("");
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
          <label>Data *</label>
          <input type="date" value={rideDate} onChange={(e) => setRideDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Titulli (opsional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p.sh. Ditar i së dielës" />
        </div>
      </div>

      {/* Strava link — auto-fills Bazë on paste (public activities). */}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Lidhja Strava (opsionale) {resolving ? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ember-deep)" }}>· duke marrë nga Strava…</span> : null}</label>
        <input value={stravaUrl} onChange={(e) => setStravaUrl(e.target.value)} placeholder="Ngjit lidhjen strava.com/activities/… ose strava.app.link/…" />
        {canEmbed && <div style={{ marginTop: 10 }}><StravaEmbed url={stravaUrl} compact /></div>}
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "6px 0 0" }}>
          Sapo ngjit lidhjen, distanca, ngjitja dhe koha plotësohen vetë (aktivitete publike). Përndryshe shkruaji te “Bazë”.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Fokusi / lloji</label>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="p.sh. 4×8 threshold, Z2 endurance" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">— Asnjë —</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      {/* Bazë — shared by the whole group; inherited by each cyclist (editable). */}
      <div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
          Bazë (e përbashkët — bartet te çdo çiklist)
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
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Vendi (opsional)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="p.sh. Germia, Prishtinë–Ferizaj" />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Çiklistët * <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--slate)" }}>(zgjidh 1 ose më shumë)</span></label>
        <AthletePicker athletes={athletes} value={selected} onChange={setSelected} mode="multi" />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Shënime të stërvitjes (opsional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kushtet, plani, vërejtjet…" />
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-ember" disabled={pending} onClick={submit}>
          {pending ? "Duke krijuar…" : "Krijo dhe shto vlerat →"}
        </button>
        <Link href="/admin/training" className="btn btn-ghost">Anulo</Link>
      </div>
      <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
        Baza bartet te çdo çiklist; pas krijimit mund t’i ndryshosh vlerat për secilin (HR, fuqia, FTP…).
      </p>
    </div>
  );
}
