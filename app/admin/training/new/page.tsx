import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { RideBuilder } from "../RideBuilder";
import type { AthleteOption } from "../AthletePicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

export default async function NewRidePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const supabase = await createClient();
  const [{ data: athleteRows }, { data: sectionRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, full_name, section_slug, gender")
      .eq("status", "active")
      .contains("positions", ["rider"])
      .order("full_name", { ascending: true }),
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
  ]);

  const athletes = (athleteRows as AthleteOption[] | null) ?? [];
  const sections = (sectionRows as { id: string; name_sq: string }[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stërvitje e re</h1>
          <div className="sub">Plotëso bazën dhe zgjidh çiklistët — vlerat individuale vijnë më pas.</div>
        </div>
        <Link className="btn btn-ghost" href="/admin/training">← Të gjitha</Link>
      </div>

      {athletes.length === 0 ? (
        <p style={{ color: "var(--ink-3)" }}>
          Nuk ka çiklistë aktivë. Shto çiklistë tek{" "}
          <Link href="/admin/team-members" style={{ color: "var(--ember)" }}>Ekipi</Link> (me pozicionin “Çiklist/e”).
        </p>
      ) : (
        <RideBuilder athletes={athletes} sections={sections} />
      )}
    </>
  );
}
