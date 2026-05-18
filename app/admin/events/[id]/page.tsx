import Link from "next/link";
import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateEvent } from "../actions";
import { EventForm } from "../EventForm";
import { CategoriesEditor } from "../CategoriesEditor";
import { EventSponsorsPanel, type EventSponsor } from "../EventSponsorsPanel";
import type { MediaOption } from "@/components/admin/MediaPicker";

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
  cover_media_id: string | null;
  strava_url: string | null;
};

type Category = { id: string; name: string; max_riders: number | null; display_order: number };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: ev },
    { data: secs },
    { data: mediaData },
    { data: cats },
    { data: eventSponsors },
  ] = await Promise.all([
    supabase.from("events")
      .select("id, title_sq, title_en, type, status, section_id, start_at, end_at, location, distance_km, elevation_m, description_sq, description_en, cover_media_id, strava_url")
      .eq("id", id).maybeSingle(),
    supabase.from("sections").select("id, name_sq").eq("active", true).order("display_order"),
    supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("event_categories").select("id, name, max_riders, display_order").eq("event_id", id).order("display_order"),
    supabase.from("sponsors")
      .select("id, name, tier, role_sq, body_sq, website_url, display_order, active, logo_media_id, logo:media!logo_media_id(storage_path)")
      .eq("event_id", id)
      .order("display_order"),
  ]);
  const row = ev as Row | null;
  if (!row) notFound();
  const sections = (secs as { id: string; name_sq: string }[] | null) ?? [];
  const media = (mediaData as MediaOption[] | null) ?? [];
  const categories = (cats as Category[] | null) ?? [];
  const eventSponsorsTyped = (eventSponsors as unknown as EventSponsor[] | null) ?? [];

  const bound = updateEvent.bind(null, row.id);

  // Quick signups count for the header chip.
  const { count: signupCount } = await supabase
    .from("event_signups")
    .select("id", { count: "exact", head: true })
    .eq("event_id", row.id);

  return (
    <>
      <div className="page-head">
        <div><h1>Edit: {row.title_sq}</h1></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-ghost btn-sm" href={`/admin/events/${row.id}/signups`}>
            Regjistrimet ({signupCount ?? 0})
          </Link>
          <Link className="btn btn-ember btn-sm" href={`/admin/events/${row.id}/results`}>
            Rezultatet →
          </Link>
        </div>
      </div>
      <EventForm
        action={bound}
        sections={sections}
        media={media}
        initial={row}
        submitLabel="Ruaj ndryshimet"
        categoriesSlot={<CategoriesEditor eventId={row.id} categories={categories} />}
      />

      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "-0.015em", margin: "0 0 16px 0" }}>
          Sponsorët e garës
        </h2>
        <div className="sub" style={{ marginBottom: 18, color: "var(--ink-3)", fontSize: 13 }}>
          Sponsorët e shtuar këtu shfaqen vetëm në faqen publike të kësaj gare. Të dhënat ruhen në të njëjtën tabelë me sponsorët globalë, me <span className="mono">event_id</span> të caktuar.
        </div>
        <EventSponsorsPanel
          eventId={row.id}
          sponsors={eventSponsorsTyped}
          mediaOptions={media}
        />
      </div>
    </>
  );
}
