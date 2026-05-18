import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateRaceEvent } from "../actions";
import { RaceForm } from "../RaceForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string;
  race_date: string;
  location: string | null;
  race_type: string | null;
  organizer: string | null;
  description: string | null;
  result_summary: string | null;
  external_url: string | null;
  cover_media_id: string | null;
  display_order: number;
};

export default async function EditRacePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: mediaData }] = await Promise.all([
    supabase.from("race_events")
      .select("id, name, race_date, location, race_type, organizer, description, result_summary, external_url, cover_media_id, display_order")
      .eq("id", id).maybeSingle(),
    supabase.from("media").select("id, storage_path, filename").order("created_at", { ascending: false }).limit(500),
  ]);
  const row = data as Row | null;
  if (!row) notFound();
  const media = (mediaData as MediaOption[] | null) ?? [];

  const bound = updateRaceEvent.bind(null, row.id);
  return (
    <>
      <div className="page-head"><div><h1>Edit: {row.name}</h1></div></div>
      <RaceForm action={bound} initial={row} media={media} submitLabel="Ruaj ndryshimet" />
    </>
  );
}
