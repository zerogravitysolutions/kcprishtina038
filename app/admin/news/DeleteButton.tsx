"use client";

import { useTransition } from "react";
import { deleteNews } from "./actions";

export function DeleteButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Fshi artikullin "${title}"? Ky veprim nuk mund të zhbëhet.`)) return;
        start(async () => {
          const r = await deleteNews(id);
          if (!r.ok) alert(`Gabim: ${r.error ?? "i panjohur"}`);
        });
      }}
      style={{ color: "var(--err)" }}
    >
      {pending ? "..." : "Fshi"}
    </button>
  );
}
