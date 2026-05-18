import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PhotoGallery, type GalleryPhoto } from "@/components/ui/PhotoGallery";
import { NewsCard } from "@/components/ui/NewsCard";
import {
  getNewsBySlug, getRecentNews, getMediaPaths, mediaUrl, formatNewsDate,
  fbPermalink,
} from "@/lib/supabase/fb";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsBySlug(slug);
  if (!article) return { title: "Lajmi nuk u gjet" };
  const description = (article.body_sq || "")
    .replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: article.title_sq,
    description: description || undefined,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: article.cover?.storage_path
      ? { images: [mediaUrl(article.cover.storage_path)!] }
      : undefined,
  };
}

export default async function NewsArticlePage({ params }: { params: Params }) {
  const t = await getTranslations();
  const { slug } = await params;
  const article = await getNewsBySlug(slug);
  if (!article) notFound();

  // Resolve gallery media paths (preserving order). Filter out the cover
  // from the gallery so the same image doesn't appear twice.
  const galleryRows = await getMediaPaths(article.gallery_media_ids);
  const coverPath = article.cover?.storage_path ?? null;
  const galleryPhotos: GalleryPhoto[] = galleryRows
    .filter((g) => g.storage_path !== coverPath)
    .map((g) => {
      const url = mediaUrl(g.storage_path)!;
      return { src: url, alt: article.title_sq };
    });

  // "More from the club" — sibling article cards.
  const related = (await getRecentNews(4)).filter((r) => r.slug !== article.slug).slice(0, 3);

  const coverUrl = mediaUrl(coverPath);
  const tag = article.tags?.[0]?.toUpperCase()
    || (article.source === "facebook" ? "FACEBOOK" : "LAJME");
  const showH1 = article.source === "manual";
  const dateLabel = formatNewsDate(article.published_at);

  return (
    <>
      <PublicNav />

      <article>
        {/* ============ Header strip ============ */}
        <header style={{ paddingTop: 96, paddingBottom: 32 }}>
          <div className="container" style={{ maxWidth: 820 }}>
            <Link
              href="/news"
              className="mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                color: "var(--ink-2)", textDecoration: "none",
                opacity: 0.7, transition: "opacity .15s",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M11 11 L3 3 M3 3 H9 M3 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>{t("news.backToList")}</span>
            </Link>

            <div
              className="mono"
              style={{
                marginTop: 32,
                fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
                color: "var(--ember)",
              }}
            >
              {dateLabel} <span style={{ color: "var(--ink-3)" }}>·</span> {tag}
            </div>

            {showH1 ? (
              <h1
                className="display"
                style={{
                  marginTop: 16,
                  fontSize: "clamp(36px, 5vw, 64px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                }}
              >
                {article.title_sq}
              </h1>
            ) : (
              // FB-sourced: lead with first sentence at display weight, then
              // the rest of the body in article copy below.
              <h1
                className="display"
                style={{
                  marginTop: 16,
                  fontSize: "clamp(28px, 4vw, 44px)",
                  letterSpacing: "-0.015em",
                  lineHeight: 1.15,
                  fontWeight: 700,
                  maxWidth: "32ch",
                }}
              >
                {article.title_sq}
              </h1>
            )}
          </div>
        </header>

        {/* ============ Hero cover ============ */}
        {coverUrl && (
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
                src={coverUrl}
                alt={article.title_sq}
                fill
                sizes="(max-width: 1240px) 100vw, 1240px"
                priority
                quality={85}
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        )}

        {/* ============ Body copy ============ */}
        {article.body_sq && (
          <div className="container" style={{ maxWidth: 720, marginTop: 56 }}>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "clamp(17px, 1.15vw, 19px)",
                lineHeight: 1.7,
                color: "var(--ink)",
                whiteSpace: "pre-wrap",
              }}
            >
              {article.body_sq}
            </div>
          </div>
        )}

        {/* ============ Gallery ============ */}
        {galleryPhotos.length > 0 && (
          <section style={{ marginTop: 72, paddingBottom: 32 }}>
            <div className="container" style={{ maxWidth: 1240 }}>
              <div className="eyebrow" style={{ marginBottom: 20 }}>
                <span>{t("news.gallery")}</span>
                <span
                  className="mono"
                  style={{ marginLeft: 8, color: "var(--ink-3)", fontSize: 11 }}
                >
                  · {galleryPhotos.length}
                </span>
              </div>
              <PhotoGallery photos={galleryPhotos} />
            </div>
          </section>
        )}

        {/* ============ Original on Facebook ============ */}
        {article.source === "facebook" && (fbPermalink(article.fb_post_id, article.external_url)) && (
          <div
            className="container"
            style={{
              maxWidth: 720,
              marginTop: 56,
              paddingTop: 24,
              borderTop: "1px solid var(--rule, rgba(15, 26, 46, 0.08))",
            }}
          >
            <a
              href={fbPermalink(article.fb_post_id, article.external_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase",
                color: "var(--ember)", textDecoration: "none",
              }}
            >
              <span>{t("news.originalOnFb")}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </a>
          </div>
        )}
      </article>

      {/* ============ More from the club ============ */}
      {related.length > 0 && (
        <section style={{ marginTop: 96, paddingTop: 56, paddingBottom: 80, background: "var(--paper-2)" }}>
          <div className="container">
            <div className="section-head" style={{ marginBottom: 32 }}>
              <div>
                <div className="eyebrow"><span>{t("news.eyebrow")}</span></div>
                <h2 className="display display-m" style={{ marginTop: 12 }}>
                  {t("news.title")}
                </h2>
              </div>
              <Link href={"/news" as never} className="btn btn-ghost" style={{ justifySelf: "start" }}>
                <span>{t("news.cta")}</span>
                <svg className="arrow" viewBox="0 0 14 14" fill="none">
                  <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </Link>
            </div>
            <div className="news-grid">
              {related.map((n) => (
                <NewsCard key={n.slug} news={n} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
