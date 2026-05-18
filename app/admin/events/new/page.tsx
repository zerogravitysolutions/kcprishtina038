import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createEvent } from "../actions";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewEventPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order");
  const sections = (data as { id: string; name_sq: string }[] | null) ?? [];
  return (
    <>
      <div className="page-head"><div><h1>Event i ri</h1></div></div>
      <EventForm action={createEvent} sections={sections} submitLabel="Krijo eventin" />
    </>
  );
}
