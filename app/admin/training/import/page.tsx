import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { stravaIsConfigured } from "@/lib/strava-api";
import { fmt, formatDurationShort } from "@/lib/training";
import { ImportReview } from "./ImportReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importo nga Strava" };

type MetricKey = "distance_km" | "moving_seconds" | "elevation_m";
type PendingEntry = {
  id: string;
  review_status: "approved" | "under_review";
  participated: boolean;
  distance_km: number | null;
  moving_seconds: number | null;
  elevation_m: number | null;
  athlete: { full_name: string } | null;
};
type PendingRide = {
  id: string; ride_date: string; title: string | null; focus: string | null;
  distance_km: number | null; moving_seconds: number | null; elevation_m: number | null;
  review_status: "approved" | "under_review"; has_pending_changes: boolean;
  entries: PendingEntry[];
};

function metric(ride: PendingRide, key: MetricKey, format: (value: number) => string, unit = ""): string {
  const values = (ride.entries ?? []).filter((entry) => entry.participated)
    .map((entry) => entry[key]).filter((value): value is number => value !== null);
  if (!values.length && ride[key] === null) return "—";
  if (!values.length) return `${format(ride[key]!)}${unit}`;
  const low = Math.min(...values), high = Math.max(...values);
  return `${low === high ? format(low) : `${format(low)}–${format(high)}`}${unit}`;
}

function RideDetail({ label, value }: { label: string; value: string }) {
  return <span style={{ display: "grid", gap: 3, minWidth: 110 }}>
    <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{label}</span>
    <strong style={{ fontSize: 13, color: "var(--ink)" }}>{value}</strong>
  </span>;
}

export default async function StravaImportPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "editor", "staff", "coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const [{ data: sections }, { data: pending, error: pendingError }] = await Promise.all([
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
    supabase.from("training_rides")
      .select("id, ride_date, title, focus, distance_km, moving_seconds, elevation_m, review_status, has_pending_changes, entries:ride_entries(id, review_status, participated, distance_km, moving_seconds, elevation_m, athlete:team_members!athlete_id(full_name))")
      .or("review_status.eq.under_review,has_pending_changes.eq.true")
      .order("ride_date", { ascending: false }),
  ]);
  if (pendingError) throw pendingError;
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
        : pendingRides.map((ride) => {
          const names = (ride.entries ?? [])
            .map((entry) => entry.athlete?.full_name ?? "Çiklist i panjohur")
            .sort((a, b) => a.localeCompare(b, "sq"));
          const awaiting = (ride.entries ?? []).filter((entry) => entry.review_status === "under_review").length;
          return <Link key={ride.id} className="card" href={`/admin/training/${ride.id}`}
            style={{ display: "block", padding: "16px 18px", textDecoration: "none" }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <span><strong>{ride.title || ride.focus || "Stërvitje"}</strong><span className="mono" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                {ride.ride_date} · {ride.review_status === "under_review" ? "Stërvitje e re" : "Çiklist i ri"}
              </span></span>
              <span className="mono" style={{ color: "var(--ember)", fontSize: 12 }}>{awaiting} në pritje →</span>
            </span>
            <span style={{ display: "flex", alignItems: "start", flexWrap: "wrap", gap: "12px 24px", marginTop: 13, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <RideDetail label="Distanca" value={metric(ride, "distance_km", (value) => fmt(value, 1), " km")} />
              <RideDetail label="Koha në lëvizje" value={metric(ride, "moving_seconds", formatDurationShort)} />
              <RideDetail label="Ngjitja" value={metric(ride, "elevation_m", (value) => fmt(value), " m")} />
              <RideDetail label={names.length === 1 ? "Çiklisti" : "Çiklistët"} value={names.length ? names.join(", ") : "—"} />
            </span>
          </Link>;
        })}
    </div>
    {stravaIsConfigured()
      ? <ImportReview sections={sections ?? []} />
      : <p>Strava është në përgatitje. Importi do të jetë i disponueshëm pasi të lidhet aplikacioni i klubit.</p>}
  </>;
}
