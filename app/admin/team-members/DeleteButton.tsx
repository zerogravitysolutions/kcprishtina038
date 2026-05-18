"use client";

import { useTransition } from "react";
import { deleteTeamMember } from "./actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Fshi anëtarin "${name}" nga ekipi?`)) return;
        start(async () => {
          const r = await deleteTeamMember(id);
          if (!r.ok) alert(`Gabim: ${r.error ?? "i panjohur"}`);
        });
      }}
      style={{ color: "var(--err)" }}
    >
      {pending ? "..." : "Fshi"}
    </button>
  );
}
