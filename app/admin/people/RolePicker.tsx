"use client";

import { useState, useTransition } from "react";
import { setUserRole } from "../actions";

const ROLES = ["admin", "editor", "staff", "coach", "member"] as const;

// Friendly Albanian labels (the value saved is still the raw role).
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Redaktor",
  staff: "Staf",
  coach: "Trajner",
  member: "Anëtar",
};
const label = (r: string) => ROLE_LABEL[r] ?? r;

export function RolePicker({ id, current, name }: { id: string; current: string; name: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);
  const [err, setErr] = useState<string | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === value) return;
    if (!confirm(`Ndrysho rolin e "${name}" nga "${label(value)}" në "${label(next)}"?`)) {
      e.target.value = value;
      return;
    }
    start(async () => {
      setErr(null);
      const r = await setUserRole(id, next);
      if (r.ok) setValue(next);
      else { setErr(r.error ?? "Dështoi."); e.target.value = value; }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        className="mono"
        style={{
          fontFamily: "var(--font-mono)", fontSize: 12,
          padding: "4px 8px",
          border: "1px solid var(--line-strong)",
          background: "var(--white)",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
      </select>
      {err && <span style={{ color: "var(--err, #c25a2d)", fontSize: 11 }}>{err}</span>}
    </div>
  );
}
