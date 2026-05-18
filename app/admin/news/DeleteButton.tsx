"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteNews } from "./actions";

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
        Fshi
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fshi artikullin"
        tone="danger"
        confirmLabel="Fshi"
        message={
          <>
            Sigurt që do ta fshish <strong>{title}</strong>? Ky veprim nuk mund të zhbëhet.
          </>
        }
        onConfirm={async () => {
          const r = await deleteNews(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gabim i panjohur" };
        }}
      />
    </>
  );
}
