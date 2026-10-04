import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { stravaIsConfigured } from "@/lib/strava-api";
import { ImportReview } from "./ImportReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importo nga Strava" };

type PendingRide = {
  id: string; ride_date: string; title: string | null; focus: string | null;
  review_status: "approved" | "under_review"; has_pending_changes: boolean;
  entries: { id: string; review_status: "approved" | "under_review" }[];
};

export default async function StravaImportPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "editor", "staff", "coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const [{ data: sections }, { data: pending }] = await Promise.all([
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
    supabase.from("training_rides")
      .select("id, ride_date, title, focus, review_status, has_pending_changes, entries:ride_entries(id, review_status)")
      .or("review_status.eq.under_review,has_pending_changes.eq.true")
      .order("ride_date", { ascending: false }),
  ]);
  const pendingRides = (pending as unknown as PendingRide[] | null) ?? [];

  return <>
    <div className="page-head">
      <div>
        <h1>Importo nga Strava</h1>
        <div className="sub">Stërvitje individuale dhe në grup nga Strava, për shqyrtim nga trajneri.</div>
      </div>
      <Link className="btn btn-ghost" href="/admin/training">← Stërvitjet</Link>
    </div>
    <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
      <h2 className="display" style={{ fontSize: 19, margin: 0 }}>Në shqyrtim · {pendingRides.length}</h2>
      {pendingRides.length === 0
        ? <div className="card" style={{ padding: 18 }}>Ende nuk ka stërvitje të propozuara për shqyrtim.</div>
        : pendingRides.map((ride) => <Link key={ride.id} className="card" href={`/admin/training/${ride.id}`}
            style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 12, textDecoration: "none" }}>
            <span><strong>{ride.title || ride.focus || "Stërvitje"}</strong><span className="mono" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
              {ride.ride_date} · {ride.review_status === "under_review" ? "Stërvitje e re" : "Çiklist i ri"}
            </span></span>
            <span className="mono" style={{ color: "var(--ember)", fontSize: 12 }}>
              {(ride.entries ?? []).filter((entry) => entry.review_status === "under_review").length} në pritje →
            </span>
          </Link>)}
    </div>
    {stravaIsConfigured()
      ? <ImportReview sections={sections ?? []} />
      : <p>Strava është në përgatitje. Importi do të jetë i disponueshëm pasi të lidhet aplikacioni i klubit.</p>}
  </>;
}
