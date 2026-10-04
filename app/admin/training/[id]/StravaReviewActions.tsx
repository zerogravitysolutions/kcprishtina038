"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveStravaReview, rejectStravaReview } from "../import/actions";

export function StravaReviewActions({ rideId, newGroup, pendingRiders }: {
  rideId: string; newGroup: boolean; pendingRiders: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <div className="card" style={{ padding: 16, marginBottom: 18, borderColor: "var(--ember)" }}>
    <strong style={{ display: "block", marginBottom: 5 }}>
      {newGroup ? "Në shqyrtim · stërvitje e re nga Strava" : "Në shqyrtim · çiklistë të shtuar më vonë"}
    </strong>
    <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
      {pendingRiders === 1 ? "1 çiklist pret" : `${pendingRiders} çiklistë presin`} miratimin. Kontrollo titullin, llojin dhe vlerat për secilin çiklist para miratimit.
    </p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn btn-ember" type="button" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const result = await approveStravaReview(rideId);
        if (result.ok) router.refresh(); else setError(result.error);
      })}>Mirato stërvitjen</button>
      <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => {
        const message = newGroup ? "Refuzo dhe fshi këtë stërvitje të propozuar?" : "Refuzo çiklistët e rinj në pritje?";
        if (!window.confirm(message)) return;
        start(async () => {
          setError(null);
          const result = await rejectStravaReview(rideId);
          if (result.ok) {
            if (newGroup) router.push("/admin/training/import"); else router.refresh();
          } else setError(result.error);
        });
      }}>Refuzo propozimin</button>
    </div>
    {error && <p role="alert" style={{ color: "var(--err)", fontSize: 13 }}>{error}</p>}
  </div>;
}
