"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMemberStatus, deleteMember } from "../actions";

export function MemberActions({ id, name, status, isSelf }: { id: string; name: string; status: string; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  if (isSelf) return <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>ti</span>;

  const active = status === "active";

  function toggle() {
    start(async () => {
      setErr(null);
      const r = await setMemberStatus(id, active ? "inactive" : "active");
      if (r.ok) router.refresh();
      else setErr(r.error ?? "Dështoi.");
    });
  }

  function del() {
    if (!confirm(`Fshi përfundimisht "${name}"?\nKjo e heq llogarinë dhe s'kthehet. Për të bllokuar hyrjen pa fshirë, përdor "Çaktivizo".`)) return;
    start(async () => {
      setErr(null);
      const r = await deleteMember(id);
      if (r.ok) router.refresh();
      else setErr(r.error ?? "Dështoi.");
    });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={toggle}>
        {active ? "Çaktivizo" : "Aktivizo"}
      </button>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={del}
        style={{ color: "var(--err)", borderColor: "color-mix(in oklab, var(--err) 32%, transparent)", background: "transparent" }}
      >
        Fshij
      </button>
      {err && <span style={{ color: "var(--err)", fontSize: 11, flexBasis: "100%" }}>{err}</span>}
    </div>
  );
}
