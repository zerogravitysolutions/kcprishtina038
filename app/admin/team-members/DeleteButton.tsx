"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteTeamMember } from "./actions";

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
        Fshi
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fshi nga ekipi"
        tone="danger"
        confirmLabel="Fshi"
        message={<>Sigurt që do ta fshish <strong>{name}</strong> nga ekipi?</>}
        onConfirm={async () => {
          const r = await deleteTeamMember(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gabim i panjohur" };
        }}
      />
    </>
  );
}
