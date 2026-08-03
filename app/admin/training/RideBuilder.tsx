"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRide } from "./actions";
import { AthletePicker, type AthleteOption } from "./AthletePicker";

type Section = { id: string; name_sq: string };

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RideBuilder({
  initialKind, athletes, sections,
}: {
  initialKind: "group" | "solo";
  athletes: AthleteOption[];
  sections: Section[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"group" | "solo">(initialKind);
  const [rideDate, setRideDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!rideDate) { setErr("Zgjidh datën."); return; }
    if (selected.length === 0) { setErr("Zgjidh së paku një çiklist."); return; }
    start(async () => {
      const r = await createRide({
        kind,
        ride_date: rideDate,
        title, focus, location, notes,
        section_id: sectionId || null,
        athlete_ids: selected,
      });
      if (r.ok) router.push(`/admin/training/${r.id}`);
      else setErr(r.error);
    });
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      {/* Kind toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["group", "solo"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); if (k === "solo") setSelected((s) => s.slice(0, 1)); }}
            className={`chip ${kind === k ? "active" : ""}`}
            style={{ padding: "8px 16px", fontSize: 12.5 }}
          >
            {k === "group" ? "Stërvitje grupi" : "Individuale"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Data *</label>
          <input type="date" value={rideDate} onChange={(e) => setRideDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Titulli (opsional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "solo" ? "p.sh. Test FTP" : "p.sh. Ditar i së dielës"} />
        </div>
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

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Vendi (opsional)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="p.sh. Germia, Prishtinë–Ferizaj" />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>{kind === "solo" ? "Çiklisti *" : "Çiklistët *"}</label>
        <AthletePicker
          athletes={athletes}
          value={selected}
          onChange={setSelected}
          mode={kind === "solo" ? "single" : "multi"}
        />
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
        Pas krijimit hapet faqja ku vendos vlerat për çdo çiklist (distanca, HR, fuqia, FTP…).
      </p>
    </div>
  );
}
