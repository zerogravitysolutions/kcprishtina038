import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createRaceEvent } from "../actions";
import { RaceForm } from "../RaceForm";
import type { MediaOption } from "@/components/admin/MediaPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  name?: string; date?: string; location?: string; race_type?: string;
  description?: string; result_summary?: string; external_url?: string;
  link_news_id?: string;
  cover_media_id?: string;
  gallery?: string;   // comma-separated uuids carried over from news.gallery_media_ids
}>;

export default async function NewRacePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const sp = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500);
  const media = (data as MediaOption[] | null) ?? [];

  const galleryIds = (sp.gallery ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Prefill from query params (used by /admin/news/[id] "Krijo gara nga ky postim").
  const initial = {
    name: sp.name ?? "",
    race_date: sp.date ?? new Date().toISOString().slice(0, 10),
    location: sp.location ?? null,
    race_type: sp.race_type ?? null,
    organizer: null,
    description: sp.description ?? null,
    result_summary: sp.result_summary ?? null,
    external_url: sp.external_url ?? null,
    cover_media_id: sp.cover_media_id ?? null,
    gallery_media_ids: galleryIds,
    display_order: 100,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Garë e re</h1>
          {sp.link_news_id && (
            <div className="sub">
              Pas krijimit, ky lajm do të lidhet automatikisht me garën
              {(sp.cover_media_id || galleryIds.length > 0) && (
                <> · imazhet nga lajmi do të barten ({galleryIds.length || 0} foto në galeri)</>
              )}.
            </div>
          )}
        </div>
      </div>
      <RaceForm
        action={createRaceEvent}
        initial={initial}
        media={media}
        linkNewsId={sp.link_news_id}
        submitLabel="Krijo garën"
      />
    </>
  );
}
