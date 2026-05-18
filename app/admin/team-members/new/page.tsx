import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createTeamMember } from "../actions";
import { TeamMemberForm } from "../TeamMemberForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewTeamMemberPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const [{ data: secs }, { data: profs }, { data: mediaData }] = await Promise.all([
    supabase.from("sections").select("slug, name_sq").eq("active", true).order("display_order"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>Anëtar i ri i ekipit</h1></div></div>
      <TeamMemberForm
        action={createTeamMember}
        sections={(secs as { slug: string; name_sq: string }[] | null) ?? []}
        profiles={(profs as { id: string; full_name: string; role: string }[] | null) ?? []}
        media={(mediaData as MediaOption[] | null) ?? []}
        submitLabel="Krijo anëtarin"
      />
    </>
  );
}
