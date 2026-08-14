"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateSignup } from "../signups/actions";
import { NumericInput } from "@/components/admin/NumericInput";
import type { Signup } from "../signups/SignupRow";

const NOTE_OPTIONS = [
  { v: "",    label: "—" },
  { v: "DNF", label: "DNF — Nuk e mbaroi" },
  { v: "DNS", label: "DNS — Nuk filloi" },
  { v: "DSQ", label: "DSQ — Diskualifikuar" },
  { v: "OTL", label: "OTL — Jashtë limitit" },
  { v: "REL", label: "REL — Zbritur në renditje" },
  { v: "ABD", label: "ABD — Hoqi dorë" },
] as const;

export function ResultRow({ eventId, s, index }: { eventId: string; s: Signup; index: number }) {
  const [pending, start] = useTransition();
  const [place, setPlace] = useState(s.result_place != null ? String(s.result_place) : "");
  const [time, setTime] = useState(s.result_time ?? "");
  const [notes, setNotes] = useState(s.result_notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Debounced autosave. Each change resets the timer; once 700ms passes
  // without further edits we fire the patch.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      setMsg(null);
      start(async () => {
        const r = await updateSignup(eventId, s.id, {
          result_place: place, result_time: time, result_notes: notes,
        });
        setMsg(r.ok ? { ok: true, text: "✓" } : { ok: false, text: r.error });
        if (r.ok) setTimeout(() => setMsg(null), 1200);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, time, notes, eventId, s.id]);

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
        <NumericInput
          kind="int"
          value={place}
          onChange={setPlace}
          placeholder="—"
          ariaLabel="Vendi"
          style={{ width: "100%", textAlign: "center" }}
        />
      </td>
      <td style={{ padding: "12px 8px", width: 140 }}>
        {/* Not a NumericInput: a finish time carries ":" and "." separators, and
            a bare numeric keypad on a phone hides both. */}
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="hh:mm:ss"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{ width: "100%", fontFamily: "var(--font-mono)" }}
        />
      </td>
      <td style={{ padding: "12px 8px", minWidth: 200 }}>
        <select
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ width: "100%" }}
        >
          {NOTE_OPTIONS.map((n) => (
            <option key={n.v} value={n.v}>{n.label}</option>
          ))}
        </select>
      </td>
      <td
        className="mono"
        style={{
          padding: "12px 8px", fontSize: 11, width: 60, textAlign: "right",
          color: msg?.ok === false ? "var(--err)" : pending ? "var(--ink-3)" : "var(--ok)",
        }}
      >
        {pending ? "…" : msg?.text ?? ""}
      </td>
    </tr>
  );
}
