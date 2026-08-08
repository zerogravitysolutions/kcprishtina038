"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteSponsor } from "./actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
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
        title="Fshij sponsorin"
        tone="danger"
        confirmLabel="Fshij"
        message={<>Sigurt që do ta fshish <strong>{name}</strong>?</>}
        onConfirm={async () => {
          const r = await deleteSponsor(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gabim i panjohur" };
        }}
      />
    </>
  );
}
