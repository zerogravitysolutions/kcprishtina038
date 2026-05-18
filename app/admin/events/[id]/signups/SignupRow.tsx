"use client";

import { useState, useTransition } from "react";
import { updateSignup, deleteSignup } from "./actions";

export type Signup = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  category: string | null;
  club: string | null;
  status: string;
  bib_number: number | null;
  result_place: number | null;
  result_time: string | null;
  result_notes: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Në pritje",
  confirmed: "Konfirmuar",
  waitlisted: "Listë pritjeje",
  cancelled: "Anuluar",
};

export function SignupRow({ eventId, s }: { eventId: string; s: Signup }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(s.status);
  const [bib, setBib] = useState(s.bib_number != null ? String(s.bib_number) : "");
  const [place, setPlace] = useState(s.result_place != null ? String(s.result_place) : "");
  const [time, setTime] = useState(s.result_time ?? "");
  const [resNotes, setResNotes] = useState(s.result_notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateSignup(eventId, s.id, {
        status, bib_number: bib, result_place: place, result_time: time, result_notes: resNotes,
      });
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 1500);
    });
  }

  function remove() {
    if (!confirm(`Fshij regjistrimin e ${s.full_name}?`)) return;
    start(async () => {
      const r = await deleteSignup(eventId, s.id);
      if (!r.ok) setMsg({ ok: false, text: r.error });
    });
  }

  const dobLabel = s.dob ? new Date(s.dob).toLocaleDateString("sq-AL") : "—";

  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
        <div style={{ fontWeight: 600 }}>{s.full_name}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {s.email}
          {s.phone && <> · {s.phone}</>}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          DOB: {dobLabel}
          {s.club && <> · {s.club}</>}
        </div>
        {s.notes && (
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, fontStyle: "italic" }}>
            “{s.notes}”
          </div>
        )}
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".08em" }}>
          {s.category ?? "—"}
        </span>
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%" }}>
          {Object.entries(STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top", width: 80 }}>
        <input value={bib} onChange={(e) => setBib(e.target.value)} placeholder="#" style={{ width: "100%" }} />
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top", width: 80 }}>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="—" style={{ width: "100%" }} />
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top", width: 110 }}>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="hh:mm:ss" style={{ width: "100%" }} />
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top", minWidth: 160 }}>
        <input value={resNotes} onChange={(e) => setResNotes(e.target.value)} placeholder="Shënim rezultati" style={{ width: "100%" }} />
      </td>
      <td style={{ padding: "12px 8px", verticalAlign: "top", whiteSpace: "nowrap" }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "…" : "Ruaj"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={remove} style={{ marginLeft: 6 }}>
          Fshij
        </button>
        {msg && (
          <div
            className="mono"
            style={{ marginTop: 6, fontSize: 11, color: msg.ok ? "var(--ok)" : "var(--err)" }}
          >
            {msg.text}
          </div>
        )}
      </td>
    </tr>
  );
}
