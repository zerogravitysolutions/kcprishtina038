import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import {
  getNewsBySlug, getMediaPaths, mediaUrl, formatNewsDate,
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
  // from the gallery to avoid showing the same image twice.
  const galleryRows = await getMediaPaths(article.gallery_media_ids);
  const coverPath = article.cover?.storage_path ?? null;
  const gallery = galleryRows.filter((g) => g.storage_path !== coverPath);

  const coverUrl = mediaUrl(coverPath);
  const tag = article.tags?.[0]?.toUpperCase()
    || (article.source === "facebook" ? "FACEBOOK" : "LAJME");

  return (
    <>
      <PublicNav />

      <article style={{ paddingTop: 96, paddingBottom: 64 }}>
        <div className="container" style={{ maxWidth: 780 }}>
          <Link
            href="/news"
            className="mono"
            style={{
              fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
              color: "var(--ink-2)", textDecoration: "none",
            }}
          >
            {t("news.backToList")}
          </Link>

          <div className="eyebrow" style={{ marginTop: 32 }}>
            <span>
              {formatNewsDate(article.published_at)} · {tag}
            </span>
          </div>

          <h1
            className="display display-l"
            style={{ marginTop: 16, lineHeight: 1.1 }}
          >
            {article.title_sq}
          </h1>
        </div>

        {coverUrl && (
          <div className="container" style={{ maxWidth: 1080, marginTop: 40 }}>
            <div
              aria-label={article.title_sq}
              style={{
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                aspectRatio: "16 / 9",
                borderRadius: 4,
              }}
            />
          </div>
        )}

        <div className="container" style={{ maxWidth: 720, marginTop: 40 }}>
          {article.body_sq && (
            <div
              style={{
                fontSize: 17, lineHeight: 1.65, color: "var(--ink)",
                whiteSpace: "pre-wrap",
              }}
            >
              {article.body_sq}
            </div>
          )}

          {gallery.length > 0 && (
            <section style={{ marginTop: 56 }}>
              <div className="eyebrow"><span>{t("news.gallery")}</span></div>
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {gallery.map((g) => {
                  const url = mediaUrl(g.storage_path);
                  if (!url) return null;
                  return (
                    <a
                      key={g.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Photo"
                      style={{
                        display: "block",
                        backgroundImage: `url(${url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        aspectRatio: "4 / 3",
                        borderRadius: 4,
                      }}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {article.source === "facebook" && article.external_url && (
            <div
              style={{
                marginTop: 56,
                paddingTop: 24,
                borderTop: "1px solid var(--rule)",
              }}
            >
              <a
                href={article.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
                style={{
                  fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase",
                  color: "var(--ember)",
                }}
              >
                {t("news.originalOnFb")} →
              </a>
            </div>
          )}
        </div>
      </article>

      <Footer />
    </>
  );
}
