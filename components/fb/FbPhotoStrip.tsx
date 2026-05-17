import { getTranslations } from "next-intl/server";
import { getFbPhotos, mediaUrl } from "@/lib/supabase/fb";
import { PhotoGallery, type GalleryPhoto } from "@/components/ui/PhotoGallery";

type Props = {
  /** How many photos to show. Default 8. */
  limit?: number;
  /** Eyebrow + title overrides. Default to gallery.* keys. */
  eyebrowKey?: string;
  titleKey?: string;
};

// Recent Facebook photos rendered as a clickable gallery (lightbox on
// click). Renders nothing when no photos are synced yet.
export async function FbPhotoStrip({
  limit = 8,
  eyebrowKey = "gallery.eyebrow",
  titleKey = "gallery.title",
}: Props = {}) {
  const t = await getTranslations();
  const photos = await getFbPhotos(limit);
  if (photos.length === 0) return null;

  const galleryPhotos: GalleryPhoto[] = photos
    .map((p) => {
      const url = mediaUrl(p.media?.storage_path ?? null);
      if (!url) return null;
      return {
        src: url,
        width: p.width ?? undefined,
        height: p.height ?? undefined,
        alt: p.alt_text ?? "",
      } as GalleryPhoto;
    })
    .filter((x): x is GalleryPhoto => x !== null);

  if (galleryPhotos.length === 0) return null;

  return (
    <section style={{ paddingTop: 72, paddingBottom: 72 }}>
      <div className="container">
        <div className="section-head" style={{ marginBottom: 28 }}>
          <div>
            <div className="eyebrow"><span>{t(eyebrowKey)}</span></div>
            <h2 className="display display-m" style={{ marginTop: 12 }}>
              {t(titleKey)}
            </h2>
          </div>
        </div>
        <PhotoGallery photos={galleryPhotos} />
      </div>
    </section>
  );
}
