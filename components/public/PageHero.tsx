import Image from "next/image";
import { getHeroPhotos, mediaUrl } from "@/lib/supabase/fb";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** When omitted, falls back to a deterministic photo picked from the
   *  hero pool (featured_in_hero) using a tiny hash of `pickerKey` so
   *  each page gets a different but stable shot. Pass null to render the
   *  hero as a clean dark band with no background image. */
  imageStoragePath?: string | null;
  imageAlt?: string;
  /** Deterministic photo picker key (typically the route path or page name). */
  pickerKey?: string;
};

// Deterministic small-pool picker — same key always returns the same slot,
// so a given page keeps the same hero across refreshes / new uploads.
function pickFromPool<T>(pool: T[], key: string | undefined): T | null {
  if (pool.length === 0) return null;
  if (!key) return pool[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

export async function PageHero({
  eyebrow,
  title,
  subtitle,
  imageStoragePath,
  imageAlt,
  pickerKey,
}: Props) {
  let resolvedPath: string | null = imageStoragePath ?? null;
  let resolvedAlt: string = imageAlt ?? "";

  // If caller didn't specify (undefined, not null), look up a hero photo.
  if (imageStoragePath === undefined) {
    const pool = await getHeroPhotos(8);
    const picked = pickFromPool(pool, pickerKey);
    resolvedPath = picked?.media?.storage_path ?? null;
    resolvedAlt = picked?.alt_text ?? "";
  }

  const url = mediaUrl(resolvedPath);

  return (
    <section className={`page-hero ${url ? "page-hero--photo" : "page-hero--plain"}`}>
      {url && (
        <div className="page-hero__bg" aria-hidden="true">
          <Image
            src={url}
            alt={resolvedAlt}
            fill
            sizes="100vw"
            quality={80}
            priority
            style={{ objectFit: "cover" }}
          />
          <div className="page-hero__veil" />
        </div>
      )}
      <div className="container page-hero__inner">
        <div className="eyebrow page-hero__eyebrow"><span>{eyebrow}</span></div>
        <h1 className="page-hero__title">{title}</h1>
        {subtitle && <p className="page-hero__lede">{subtitle}</p>}
      </div>
    </section>
  );
}
