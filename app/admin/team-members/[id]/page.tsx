import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateTeamMember } from "../actions";
import { TeamMemberForm } from "../TeamMemberForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  positions: string[];
  section_slug: string | null;
  photo_media_id: string | null;
  external_photo_url: string | null;
  status: string;
  ended_at: string | null;
  bio: string | null;
  display_order: number;
  profile_id: string | null;
  is_master: boolean;
};

export default async function EditTeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tm }, { data: secs }, { data: profs }, { data: mediaData }] = await Promise.all([
    supabase.from("team_members")
      .select("id, first_name, last_name, dob, gender, positions, section_slug, photo_media_id, external_photo_url, status, ended_at, bio, display_order, profile_id, is_master")
      .eq("id", id).maybeSingle(),
    supabase.from("sections").select("slug, name_sq").eq("active", true).order("display_order"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const row = tm as Row | null;
  if (!row) notFound();
  const bound = updateTeamMember.bind(null, row.id);

  return (
    <>
      <div className="page-head"><div><h1>Ndrysho: {row.first_name} {row.last_name}</h1></div></div>
      <TeamMemberForm
        action={bound}
        initial={row}
        sections={(secs as { slug: string; name_sq: string }[] | null) ?? []}
        profiles={(profs as { id: string; full_name: string; role: string }[] | null) ?? []}
        media={(mediaData as MediaOption[] | null) ?? []}
        submitLabel="Ruaj ndryshimet"
      />
    </>
  );
}
