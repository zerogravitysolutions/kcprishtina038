import { createClient, getProfile } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { redirect } from "next/navigation";

type FullProfile = {
  full_name: string; email: string; phone: string | null;
  dob: string | null; bio: string | null;
  metadata: Record<string, string> | null;
};

export default async function ProfilePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles")
    .select("full_name, email, phone, dob, bio, metadata")
    .eq("id", profile.id).maybeSingle();
  const full = (data as FullProfile | null) ?? null;

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
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>Personal information</h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "4px 0 20px" }}>Your contact details. Used by your section coach and for race registrations.</p>
        <ProfileForm initial={full ?? { full_name: profile.full_name, email: profile.email, phone: null, dob: null, bio: null, metadata: null }} />
      </div>
    </>
  );
}
