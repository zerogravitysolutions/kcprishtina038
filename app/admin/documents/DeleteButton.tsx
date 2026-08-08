"use client";

import { useTransition } from "react";
import { deleteDocument } from "./actions";

export function DeleteButton({ id, storagePath, title }: { id: string; storagePath: string; title: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: "4px 10px", fontSize: 11.5 }}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Fshij "${title}"? Kjo nuk mund të zhbëhet.`)) return;
        start(async () => {
          const res = await deleteDocument(id, storagePath);
          if (!res.ok) alert(`Fshirja dështoi: ${res.error}`);
        });
      }}
    >
      {pending ? "…" : "Fshij"}
    </button>
  );
}
