import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createEvent } from "../actions";
import { EventForm } from "../EventForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewEventPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const [{ data: secs }, { data: mediaData }] = await Promise.all([
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
    supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const sections = (secs as { id: string; name_sq: string }[] | null) ?? [];
  const media = (mediaData as MediaOption[] | null) ?? [];
  return (
    <>
      <div className="page-head"><div><h1>Event i ri</h1></div></div>
      <EventForm action={createEvent} sections={sections} media={media} submitLabel="Krijo eventin" />
    </>
  );
}
