import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { RideHeaderForm, type RideHeader } from "./RideHeaderForm";
import { EntryEditor, type EntryRow } from "./EntryEditor";
import { AddAthlete } from "./AddAthlete";
import { RideDeleteButton } from "./RideDeleteButton";
import type { AthleteOption } from "../AthletePicker";
import { fmt, sum, formatDurationShort } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type EntryJoined = EntryRow & {
  distance_km: number | null;
  moving_seconds: number | null;
  athlete: {
    id: string;
    full_name: string;
    section_slug: string | null;
    profile: { weight_kg: number | null; ftp_w: number | null } | null;
  } | null;
};

export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rideData }, { data: entryData }, { data: sectionRows }, { data: athleteRows }] = await Promise.all([
    supabase
      .from("training_rides")
      .select("id, ride_date, focus, section_id, strava_url")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("ride_entries")
      .select("*, athlete:team_members!athlete_id(id, full_name, section_slug, profile:athlete_profiles(weight_kg, ftp_w))")
      .eq("ride_id", id),
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
    supabase.from("team_members").select("id, full_name, section_slug, gender").eq("status", "active").contains("positions", ["rider"]).order("full_name"),
  ]);

  const ride = rideData as RideHeader | null;
  if (!ride) notFound();

  const entries = ((entryData as unknown as EntryJoined[] | null) ?? [])
    .slice()
    .sort((a, b) => (a.athlete?.full_name ?? "").localeCompare(b.athlete?.full_name ?? "", "sq"));
  const sections = (sectionRows as { id: string; name_sq: string }[] | null) ?? [];
  const athletes = (athleteRows as AthleteOption[] | null) ?? [];

  const parts = entries.filter((e) => e.participated).length;
  const totalKm = sum(entries.map((e) => e.distance_km));
  const totalSec = sum(entries.map((e) => e.moving_seconds));
  const existingIds = entries.map((e) => e.athlete_id);
  const dateLabel = new Date(ride.ride_date + "T00:00:00").toLocaleDateString("sq", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{ride.focus || "Stërvitje"}</h1>
          <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12, letterSpacing: ".06em", marginTop: 6 }}>
            {dateLabel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost btn-sm" href="/admin/training">← Të gjitha</Link>
          <RideDeleteButton id={ride.id} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "0 0 20px", padding: "12px 16px", background: "var(--paper-2)", borderRadius: 8 }}>
        <Stat label="Çiklistë" value={String(parts)} />
        <Stat label="KM gjithsej" value={totalKm > 0 ? fmt(totalKm, 1) : "—"} />
        <Stat label="Koha gjithsej" value={totalSec > 0 ? formatDurationShort(totalSec) : "—"} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <RideHeaderForm ride={ride} sections={sections} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 className="display" style={{ fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>Vlerat për çiklist</h2>
        <AddAthlete rideId={ride.id} athletes={athletes} existing={existingIds} />
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--ink-3)" }}>Asnjë çiklist në këtë stërvitje. Shtoje me “+ Shto çiklist”.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map((e, i) => (
            <EntryEditor
              key={e.id}
              rideId={ride.id}
              entry={e}
              index={i}
              defaultOpen={entries.length === 1}
              athlete={{
                id: e.athlete?.id ?? e.athlete_id,
                full_name: e.athlete?.full_name ?? "—",
                section_slug: e.athlete?.section_slug ?? null,
                weight_kg: e.athlete?.profile?.weight_kg ?? null,
                ftp_w: e.athlete?.profile?.ftp_w ?? null,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
