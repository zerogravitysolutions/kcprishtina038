import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createSponsor } from "../actions";
import { SponsorForm } from "../SponsorForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewSponsorPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500);
  const media = (data as MediaOption[] | null) ?? [];
  return (
    <>
      <div className="page-head"><div><h1>Sponsor i ri</h1></div></div>
      <SponsorForm action={createSponsor} media={media} submitLabel="Krijo sponsorin" />
    </>
  );
}
