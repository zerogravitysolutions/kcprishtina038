"use client";

import { useTransition } from "react";
import { deleteResult } from "./actions";

export function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("A je i sigurt që do ta fshish rezultatin?")) return;
        start(async () => {
          const r = await deleteResult(id);
          if (!r.ok) alert(`Gabim: ${r.error ?? "i panjohur"}`);
        });
      }}
      style={{ color: "var(--err)" }}
    >
      {pending ? "…" : "Fshij"}
    </button>
  );
}
