"use client";

import { useState, useTransition } from "react";
import { approveApplication, rejectApplication } from "../actions";

type Props = {
  id: string;
  name: string;
  status: string;
};

// Inline approve/reject buttons next to a pending application row.
// Approve is one click. Reject opens a small prompt for an optional reason.
export function ApplicationActions({ id, name, status }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending") {
    return <span style={{ color: "var(--ink-3)", fontSize: 11 }}>—</span>;
  }

  const onApprove = () => {
    if (!confirm(`Aprovo aplikimin e "${name}"?`)) return;
    start(async () => {
      setError(null);
      const r = await approveApplication(id);
      if (!r.ok) setError(r.error ?? "Aprovimi dështoi.");
    });
  };

  const onReject = () => {
    const reason = prompt(`Arsyeja e refuzimit për "${name}" (opsionale):`, "");
    if (reason === null) return; // user pressed Cancel
    start(async () => {
      setError(null);
      const r = await rejectApplication(id, reason || null);
      if (!r.ok) setError(r.error ?? "Refuzimi dështoi.");
    });
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        className="btn"
        style={{ padding: "5px 10px", fontSize: 11.5, background: "var(--ember)", borderColor: "var(--ember)" }}
        disabled={pending}
        onClick={onApprove}
      >
        {pending ? "…" : "Aprovo"}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "5px 10px", fontSize: 11.5 }}
        disabled={pending}
        onClick={onReject}
      >
        Refuzo
      </button>
      {error && (
        <span style={{ color: "var(--err, #c25a2d)", fontSize: 11 }}>{error}</span>
      )}
    </div>
  );
}
