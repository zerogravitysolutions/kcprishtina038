import { ConnectWithStrava, PoweredByStrava } from "@/components/strava/StravaBrand";
import Link from "next/link";
import { createClient, getProfile } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { disconnectStrava } from "./strava-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { stravaIsConfigured } from "@/lib/strava-api";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FullProfile = {
  full_name: string; email: string; phone: string | null;
  dob: string | null; bio: string | null;
  metadata: Record<string, string> | null;
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ strava?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const { strava: stravaStatus } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: rider }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone, dob, bio, metadata").eq("id", profile.id).maybeSingle(),
    supabase.from("team_members").select("id").eq("profile_id", profile.id).contains("positions", ["rider"]).maybeSingle(),
  ]);
  const full = (data as FullProfile | null) ?? null;
  const configured = stravaIsConfigured();
  let connected = false;
  if (rider && configured) {
    const { data: connection } = await createAdminClient().from("strava_connections")
      .select("athlete_id").eq("athlete_id", rider.id).maybeSingle();
    connected = !!connection;
  }

  return (
    <>
      <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(28px, 3vw, 38px)", letterSpacing: "-0.025em", lineHeight: 1, margin: 0 }}>
          {profile.full_name}
        </h1>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          {profile.email}
        </div>
      </div>

      <div style={{ background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 14, padding: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>Të dhënat personale</h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "4px 0 20px" }}>Të dhënat e tua të kontaktit. Përdoren nga trajneri i seksionit tënd dhe për regjistrimet në gara.</p>
        <ProfileForm initial={full ?? { full_name: profile.full_name, email: profile.email, phone: null, dob: null, bio: null, metadata: null }} />
      </div>

      {rider && <div style={{ background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 14, padding: 24, marginTop: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, margin: 0 }}>Strava</h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "6px 0 14px" }}>
          {connected ? "Llogaria jote është lidhur. Aktivitetet e çiklizmit importohen automatikisht si stërvitje të klubit." : "Lidhe llogarinë që aktivitetet e tua të çiklizmit të importohen automatikisht si stërvitje të klubit."}
        </p>
        {stravaStatus && stravaStatus !== "connected" && stravaStatus !== "disconnected" &&
          <p role="alert" style={{ color: "var(--err)", fontSize: 12 }}>Lidhja me Strava nuk u përfundua. Provo sërish.</p>}
        {configured ? connected ? (
          <form action={disconnectStrava}><button type="submit" className="btn btn-ghost">Shkëput Strava</button></form>
        ) : (
          <ConnectWithStrava href="/api/strava/connect" />
        ) : <span style={{ color: "var(--ink-3)", fontSize: 12 }}>Lidhja me Strava është në përgatitje.</span>}
        <PoweredByStrava style={{ marginTop: 18 }} />
      </div>}

      {/* The money panel is not a sixth tab on the phone, so it needs a door
          here as well as on the dashboard. */}
      <Link
        href="/portal/membership"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 16, background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 14, padding: "18px 24px" }}
      >
        <span>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.015em" }}>
            Anëtarësia & faturat
          </span>
          <span style={{ display: "block", fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
            Plani yt, gjendja e pagesave dhe faturat mujore.
          </span>
        </span>
        <span aria-hidden style={{ fontFamily: "var(--font-mono)", color: "var(--ember)", fontSize: 18 }}>→</span>
      </Link>
    </>
  );
}
