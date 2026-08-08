import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { updateNews } from "../actions";
import { NewsForm } from "../NewsForm";
import type { MediaOption } from "@/components/admin/MediaPicker";
import { detectRaceSignal } from "@/lib/race-detect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  slug: string;
  title_sq: string;
  body_sq: string;
  status: string;
  tags: string[];
  cover_media_id: string | null;
  gallery_media_ids: string[];
  race_event_id: string | null;
  published_at: string | null;
  external_url: string | null;
  race_event: { id: string; name: string; race_date: string } | null;
};

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: rowData }, { data: mediaData }] = await Promise.all([
    supabase.from("news")
      .select("id, slug, title_sq, body_sq, status, tags, cover_media_id, gallery_media_ids, race_event_id, published_at, external_url, race_event:race_events(id, name, race_date)")
      .eq("id", id).maybeSingle(),
    supabase.from("media").select("id, storage_path, filename, alt, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const row = rowData as unknown as Row | null;
  if (!row) notFound();
  const media = (mediaData as MediaOption[] | null) ?? [];

  const bound = updateNews.bind(null, row.id);

  // Race detector: only show the banner when no race_event is already linked.
  const signal = !row.race_event_id ? detectRaceSignal({ title: row.title_sq, body: row.body_sq }) : null;
  const prefillParams = signal?.likely
    ? new URLSearchParams({
        name: signal.nameGuess ?? row.title_sq.split(/[—–.\n]/)[0].slice(0, 60).trim(),
        date: (row.published_at ?? new Date().toISOString()).slice(0, 10),
        description: row.body_sq.slice(0, 800),
        external_url: row.external_url ?? "",
        link_news_id: row.id,
        // Carry the news cover + gallery into the race entry so the
        // images don't have to be re-attached manually.
        ...(row.cover_media_id ? { cover_media_id: row.cover_media_id } : {}),
        ...(row.gallery_media_ids && row.gallery_media_ids.length > 0
          ? { gallery: row.gallery_media_ids.join(",") }
          : {}),
      }).toString()
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ndrysho: {row.title_sq}</h1>
          <div className="sub">/news/{row.slug}</div>
        </div>
        <a className="btn btn-ghost" href={`/news/${row.slug}`} target="_blank">Shiko ↗</a>
      </div>

      {row.race_event && (
        <div style={{
          marginBottom: 18, padding: "12px 16px",
          background: "color-mix(in oklab, var(--ok) 12%, var(--white))",
          border: "1px solid color-mix(in oklab, var(--ok) 30%, transparent)",
          borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div>
            <strong>I lidhur me garën:</strong>{" "}
            <Link href={`/admin/races/${row.race_event.id}`}>{row.race_event.name}</Link>{" "}
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".1em" }}>
              · {new Date(row.race_event.race_date).toLocaleDateString("sq")}
            </span>
          </div>
        </div>
      )}

      {signal?.likely && (
        <div style={{
          marginBottom: 18, padding: "14px 18px",
          background: "color-mix(in oklab, var(--ember) 10%, var(--white))",
          border: "1px solid color-mix(in oklab, var(--ember) 30%, transparent)",
          borderRadius: 10,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ maxWidth: "60ch" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--ember-deep)" }}>
              🏁 Ky postim duket si raport gare.
            </div>
            <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Krijoje si garë të veçantë dhe lidhe me këtë lajm — që në faqen publike <code>/races</code> të shfaqet si garë më vete me lajmin si burim.
              {signal.nameGuess && (
                <>
                  {" "}
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".06em" }}>
                    Emri i sugjeruar: {signal.nameGuess}
                  </span>
                </>
              )}
            </div>
          </div>
          <Link className="btn btn-ember btn-sm" href={`/admin/races/new?${prefillParams}`}>
            Krijo garë nga ky postim →
          </Link>
        </div>
      )}

      <NewsForm
        action={bound}
        media={media}
        initial={{
          title_sq: row.title_sq,
          body_sq: row.body_sq,
          status: row.status,
          tags: row.tags ?? [],
          cover_media_id: row.cover_media_id,
          gallery_media_ids: row.gallery_media_ids ?? [],
          slug: row.slug,
        }}
        submitLabel="Ruaj ndryshimet"
      />
    </>
  );
}
