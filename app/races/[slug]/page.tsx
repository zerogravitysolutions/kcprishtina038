import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { NewsCard } from "@/components/ui/NewsCard";
import { PhotoGallery, type GalleryPhoto } from "@/components/ui/PhotoGallery";
import {
  getRaceEventBySlug, getNewsForRaceEvent, getMediaByIds,
  mediaUrl, raceTypeLabel,
} from "@/lib/supabase/fb";
import { parseResults } from "@/lib/parse-results";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const race = await getRaceEventBySlug(slug);
  if (!race) return { title: "Garë nuk u gjet" };
  return {
    title: race.name,
    description: race.description ?? `${race.name} — ${race.location ?? ""}`,
    alternates: { canonical: `/races/${race.slug}` },
    openGraph: race.cover?.storage_path
      ? { images: [mediaUrl(race.cover.storage_path)!] }
      : undefined,
  };
}

export default async function RaceEventPage({ params }: { params: Params }) {
  const { slug } = await params;
  const race = await getRaceEventBySlug(slug);
  if (!race) notFound();

  const posts = await getNewsForRaceEvent(race.id);
  const cover = mediaUrl(race.cover?.storage_path ?? null);
  const dateLabel = new Date(race.race_date).toLocaleDateString("sq", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const parsedResults = parseResults(race.result_summary);

  // Gallery resolution: race.gallery_media_ids if curated (≥2 photos).
  // Otherwise fall back to the union of linked-news gallery_media_ids so
  // races created from a news post automatically show all the photos
  // without manual picking. Dedupe + drop the cover so it isn't shown
  // twice next to the big hero.
  let galleryIds: string[] = race.gallery_media_ids ?? [];
  if (galleryIds.length < 2 && posts.length > 0) {
    const seen = new Set<string>(galleryIds);
    for (const p of posts) {
      for (const id of p.gallery_media_ids ?? []) {
        if (!seen.has(id)) { seen.add(id); galleryIds.push(id); }
      }
    }
  }
  if (race.cover_media_id) {
    galleryIds = galleryIds.filter((id) => id !== race.cover_media_id);
  }
  const galleryMedia = galleryIds.length ? await getMediaByIds(galleryIds) : [];
  const galleryPhotos: GalleryPhoto[] = galleryMedia.map((m) => ({
    src: mediaUrl(m.storage_path)!,
    alt: m.alt,
    width: m.width,
    height: m.height,
  })).filter((p) => p.src);

  return (
    <>
      <PublicNav />

      <article>
        {/* Header */}
        <header style={{ paddingTop: 96, paddingBottom: 32 }}>
          <div className="container" style={{ maxWidth: 880 }}>
            <Link
              href="/races"
              className="mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                color: "var(--ink-2)", textDecoration: "none", opacity: 0.7,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M11 11 L3 3 M3 3 H9 M3 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Të gjitha garat</span>
            </Link>

            <div
              className="mono"
              style={{
                marginTop: 32,
                fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
                color: "var(--ember)",
              }}
            >
              {dateLabel}
              {race.race_type && <> <span style={{ color: "var(--ink-3)" }}>·</span> {raceTypeLabel(race.race_type)}</>}
            </div>

            <h1
              className="display"
              style={{
                marginTop: 16,
                fontSize: "clamp(36px, 5vw, 64px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
              }}
            >
              {race.name}
            </h1>

            {(race.location || race.organizer) && (
              <div
                className="race-detail-meta"
                style={{
                  marginTop: 20, display: "flex", flexWrap: "wrap", gap: 24,
                  fontFamily: "var(--font-mono)", fontSize: 12,
                  letterSpacing: ".08em", color: "var(--ink-3)",
                }}
              >
                {race.location && <span>📍 {race.location}</span>}
                {race.organizer && <span>🏁 {race.organizer}</span>}
                {posts.length > 0 && <span>📰 {posts.length} postim{posts.length === 1 ? "" : "e"}</span>}
              </div>
            )}
          </div>
        </header>

        {/* Cover */}
        {cover && (
          <div className="container" style={{ maxWidth: 1240, marginTop: 8 }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--paper-2)",
              }}
            >
              <Image
                src={cover}
                alt={race.name}
                fill
                sizes="(max-width: 1240px) 100vw, 1240px"
                priority
                quality={85}
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        )}

        {/* Description */}
        {race.description && (
          <div className="container" style={{ maxWidth: 720, marginTop: 48 }}>
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "clamp(17px, 1.15vw, 19px)",
              lineHeight: 1.7,
              color: "var(--ink)",
              whiteSpace: "pre-wrap",
            }}>
              {race.description}
            </p>
            {race.result_summary && (
              <div className="race-results">
                <div className="race-results__head">
                  <span className="eyebrow"><span>Rezultati i klubit</span></span>
                </div>
                {parsedResults.length >= 2 ? (
                  <ol className="race-results__list">
                    {parsedResults
                      .slice()
                      .sort((a, b) => a.place - b.place)
                      .map((r, i) => (
                        <li key={`${r.name}-${i}`} className={`race-results__row ${r.place <= 3 ? `race-results__row--podium-${r.place}` : ""}`}>
                          <span className="race-results__rank">
                            {r.place === 1 ? "🥇" : r.place === 2 ? "🥈" : r.place === 3 ? "🥉" : `${r.label}.`}
                          </span>
                          <span className="race-results__name">{r.name}</span>
                          <span className="race-results__place mono">vendi {r.label}</span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="race-results__text">{race.result_summary}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Gallery */}
        {galleryPhotos.length > 0 && (
          <section style={{ marginTop: 64 }}>
            <div className="container" style={{ maxWidth: 1240 }}>
              <div className="section-head" style={{ marginBottom: 24 }}>
                <div>
                  <div className="eyebrow"><span>Galeria</span></div>
                  <h2 className="display display-m" style={{ marginTop: 10 }}>
                    {galleryPhotos.length === 1 ? "1 fotografi" : `${galleryPhotos.length} fotografi`}
                  </h2>
                </div>
              </div>
              <PhotoGallery photos={galleryPhotos} uniform={galleryPhotos.length > 6} />
            </div>
          </section>
        )}

        {/* Linked news posts */}
        {posts.length > 0 && (
          <section style={{ marginTop: 72, paddingBottom: 32 }}>
            <div className="container">
              <div className="section-head" style={{ marginBottom: 28 }}>
                <div>
                  <div className="eyebrow"><span>Nga gara</span></div>
                  <h2 className="display display-m" style={{ marginTop: 10 }}>
                    {posts.length === 1 ? "1 postim" : `${posts.length} postime`}.
                  </h2>
                </div>
              </div>
              <div className="news-grid">
                {posts.map((p) => <NewsCard key={p.slug} news={p} />)}
              </div>
            </div>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}
