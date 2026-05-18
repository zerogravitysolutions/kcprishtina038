"use client";

import { useState, useTransition } from "react";
import { updateSignup, deleteSignup } from "./actions";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export type Signup = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
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

export function SignupRow({ eventId, s, index }: { eventId: string; s: Signup; index: number }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(s.status);
  const [bib, setBib] = useState(s.bib_number != null ? String(s.bib_number) : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateSignup(eventId, s.id, { status, bib_number: bib });
      setMsg(r.ok ? { ok: true, text: "✓" } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => setMsg(null), 1500);
    });
  }

  const dobLabel = s.dob ? new Date(s.dob).toLocaleDateString("sq-AL") : "—";
  const gender = s.gender === "m" ? "M" : s.gender === "f" ? "F" : s.gender === "other" ? "Tj." : "—";
  const createdAt = new Date(s.created_at).toLocaleDateString("sq-AL", { day: "2-digit", month: "short" });

  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--line)" }}>
        <td className="mono" style={{ padding: "12px 8px", color: "var(--ink-3)", fontSize: 11, width: 32 }}>
          {String(index + 1).padStart(2, "0")}
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
          <div style={{ fontWeight: 600 }}>{s.full_name}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            {s.email}
            {s.phone && <> · {s.phone}</>}
          </div>
          {s.notes && (
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, fontStyle: "italic" }}>
              “{s.notes}”
            </div>
          )}
        </td>
        <td className="mono" style={{ padding: "12px 8px", fontSize: 11, color: "var(--ink-2)" }}>{gender}</td>
        <td className="mono" style={{ padding: "12px 8px", fontSize: 11, color: "var(--ink-2)" }}>{dobLabel}</td>
        <td className="mono" style={{ padding: "12px 8px", fontSize: 11, color: "var(--ink-2)" }}>{s.club ?? "—"}</td>
        <td style={{ padding: "12px 8px", width: 150 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%" }}>
            {Object.entries(STATUS_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </td>
        <td style={{ padding: "12px 8px", width: 70 }}>
          <input value={bib} onChange={(e) => setBib(e.target.value)} placeholder="#" style={{ width: "100%" }} />
        </td>
        <td className="mono" style={{ padding: "12px 8px", fontSize: 11, color: "var(--ink-3)" }}>{createdAt}</td>
        <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
          <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
            {pending ? "…" : "Ruaj"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 6, color: "var(--err)" }}
            onClick={() => setConfirmDel(true)}
          >
            Fshi
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

      <ConfirmModal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Fshi regjistrimin"
        tone="danger"
        confirmLabel="Fshi"
        message={<>Sigurt që do ta fshish regjistrimin e <strong>{s.full_name}</strong>?</>}
        onConfirm={async () => {
          const r = await deleteSignup(eventId, s.id);
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        }}
      />
    </>
  );
}
