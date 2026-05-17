import Image from "next/image";
import Link from "next/link";
import {
  formatNewsDate, mediaUrl,
  newsCardTitle, newsCardExcerpt,
  type NewsCard as NewsCardData,
} from "@/lib/supabase/fb";

type Props = {
  news: NewsCardData;
  /** When true, eagerly load the cover (for above-the-fold cards). */
  priority?: boolean;
};

// Single card used on the landing news strip and the /news list. Server-
// rendered. Hover state and bounce come from the existing .news-card CSS.
export function NewsCard({ news: n, priority = false }: Props) {
  const imgUrl = mediaUrl(n.cover?.storage_path ?? null);
  const title = newsCardTitle(n);
  const excerpt = newsCardExcerpt(n);
  const tag = n.tags?.[0]?.toUpperCase() || (n.source === "facebook" ? "FACEBOOK" : "LAJME");
  const dateLabel = formatNewsDate(n.published_at);

  return (
    <Link href={`/news/${n.slug}` as never} className="news-card" aria-label={title}>
      <div className="ph" style={{ position: "relative", overflow: "hidden" }}>
        {imgUrl ? (
          <Image
            src={imgUrl}
            alt={title}
            fill
            sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
            priority={priority}
            quality={70}
            style={{
              objectFit: "cover",
              transition: "transform .5s cubic-bezier(.2,.7,.2,1)",
            }}
          />
        ) : (
          <>
            <span className="ph-label">{tag}</span>
            <span className="ph-corner">JPG · 4:3</span>
          </>
        )}
      </div>
      <span className="date mono">
        {dateLabel} · {tag}
      </span>
      <h3>{title || "KÇ Prishtina 038"}</h3>
      {excerpt && (
        <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0, lineHeight: 1.55 }}>
          {excerpt}
        </p>
      )}
    </Link>
  );
}
