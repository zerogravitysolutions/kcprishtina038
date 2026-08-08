"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRaceSuggestion, declineRaceSuggestion } from "./actions";

export function RaceSuggestionActions({ newsId }: { newsId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.ok) router.refresh();
      else setErr(r.error ?? "Dështoi.");
    });
  }

  return (
    <div className="rs-actions">
      <button type="button" className="btn btn-ember btn-sm" disabled={pending} onClick={() => run(() => approveRaceSuggestion(newsId))}>
        ✓ Aprovo
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => declineRaceSuggestion(newsId))}>
        Refuzo
      </button>
      {err && <span style={{ color: "var(--err)", fontSize: 11, flexBasis: "100%" }}>{err}</span>}
    </div>
  );
}
