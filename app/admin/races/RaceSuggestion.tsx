"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declineRaceSuggestion } from "./actions";

export function RaceSuggestionActions({ newsId, approveHref }: { newsId: string; approveHref: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="rs-actions">
      {/* Approve → review the pre-filled form (set the real race date + results) → create. */}
      <Link className="btn btn-ember btn-sm" href={approveHref}>✓ Aprovo</Link>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() => start(async () => {
          setErr(null);
          const r = await declineRaceSuggestion(newsId);
          if (r.ok) router.refresh();
          else setErr(r.error ?? "Dështoi.");
        })}
      >
        Refuzo
      </button>
      {err && <span style={{ color: "var(--err)", fontSize: 11, flexBasis: "100%" }}>{err}</span>}
    </div>
  );
}
