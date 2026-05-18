"use client";

import { useState, useTransition } from "react";
import { updateSignup } from "../signups/actions";
import type { Signup } from "../signups/SignupRow";

export function ResultRow({ eventId, s, index }: { eventId: string; s: Signup; index: number }) {
  const [pending, start] = useTransition();
  const [place, setPlace] = useState(s.result_place != null ? String(s.result_place) : "");
  const [time, setTime] = useState(s.result_time ?? "");
  const [notes, setNotes] = useState(s.result_notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateSignup(eventId, s.id, {
        result_place: place,
        result_time: time,
        result_notes: notes,
      });
      setMsg(r.ok ? { ok: true, text: "✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 1500);
    });
  }

  const gender = s.gender === "m" ? "M" : s.gender === "f" ? "F" : s.gender === "other" ? "Tj." : "—";

  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      <td className="mono" style={{ padding: "12px 8px", color: "var(--ink-3)", fontSize: 11, width: 32 }}>
        {String(index + 1).padStart(2, "0")}
      </td>
      <td className="mono" style={{ padding: "12px 8px", width: 70, fontWeight: 600 }}>
        {s.bib_number ?? "—"}
      </td>
      <td style={{ padding: "12px 8px" }}>
        <div style={{ fontWeight: 600 }}>{s.full_name}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {gender} {s.club ? `· ${s.club}` : ""}
        </div>
      </td>
      <td style={{ padding: "12px 8px", width: 90 }}>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="—"
          style={{ width: "100%", textAlign: "center", fontFamily: "var(--font-mono)" }}
        />
      </td>
      <td style={{ padding: "12px 8px", width: 140 }}>
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="hh:mm:ss"
          style={{ width: "100%", fontFamily: "var(--font-mono)" }}
        />
      </td>
      <td style={{ padding: "12px 8px", minWidth: 200 }}>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="DNF, DNS, mekanik..."
          style={{ width: "100%" }}
        />
      </td>
      <td style={{ padding: "12px 8px", whiteSpace: "nowrap", width: 130 }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "…" : "Ruaj"}
        </button>
        {msg && (
          <span
            className="mono"
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: msg.ok ? "var(--ok)" : "var(--err)",
            }}
          >
            {msg.text}
          </span>
        )}
      </td>
    </tr>
  );
}
