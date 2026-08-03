import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { RideBuilder } from "../RideBuilder";
import type { AthleteOption } from "../AthletePicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COACH_ROLES = ["admin", "editor", "staff", "coach"];

export default async function NewRidePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const kind = sp.kind === "solo" ? "solo" : "group";

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
          <h1>{kind === "solo" ? "Stërvitje individuale" : "Stërvitje grupi"}</h1>
          <div className="sub">Krijo stërvitjen dhe zgjidh çiklistët — vlerat vendosen në hapin tjetër.</div>
        </div>
        <Link className="btn btn-ghost" href="/admin/training">← Të gjitha</Link>
      </div>

      {athletes.length === 0 ? (
        <p style={{ color: "var(--ink-3)" }}>
          Nuk ka çiklistë aktivë. Shto çiklistë te{" "}
          <Link href="/admin/team-members" style={{ color: "var(--ember)" }}>Ekipi</Link> (me pozicionin “Çiklist/e”).
        </p>
      ) : (
        <RideBuilder initialKind={kind} athletes={athletes} sections={sections} />
      )}
    </>
  );
}
