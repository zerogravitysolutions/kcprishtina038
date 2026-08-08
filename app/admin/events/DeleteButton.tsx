"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteEvent } from "./actions";

export function DeleteButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        style={{ color: "var(--err)" }}
      >
        Fshij
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fshij eventin"
        tone="danger"
        confirmLabel="Fshij"
        message={
          <>
            Sigurt që do ta fshish <strong>{title}</strong>? Regjistrimet dhe rezultatet e lidhura me të do të fshihen gjithashtu.
          </>
        }
        onConfirm={async () => {
          const r = await deleteEvent(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gabim i panjohur" };
        }}
      />
    </>
  );
}
