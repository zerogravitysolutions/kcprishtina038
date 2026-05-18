import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateEvent } from "../actions";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  title_sq: string;
  title_en: string | null;
  type: string;
  status: string;
  section_id: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  description_sq: string | null;
  description_en: string | null;
};

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events")
    .select("id, title_sq, title_en, type, status, section_id, start_at, end_at, location, distance_km, elevation_m, description_sq, description_en")
    .eq("id", id).maybeSingle();
  const row = ev as Row | null;
  if (!row) notFound();

  const { data: secs } = await supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order");
  const sections = (secs as { id: string; name_sq: string }[] | null) ?? [];

  const bound = updateEvent.bind(null, row.id);

  return (
    <>
      <div className="page-head"><div><h1>Edit: {row.title_sq}</h1></div></div>
      <EventForm action={bound} sections={sections} initial={row} submitLabel="Ruaj ndryshimet" />
    </>
  );
}
