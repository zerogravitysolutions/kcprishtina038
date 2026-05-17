import { getTranslations } from "next-intl/server";
import { getFbPhotos, mediaUrl } from "@/lib/supabase/fb";

type Props = {
  /** How many photos to show. Default 8. */
  limit?: number;
  /** Eyebrow + title overrides. Default to gallery.* keys. */
  eyebrowKey?: string;
  titleKey?: string;
};

// Horizontal grid of recent Facebook photos. Renders nothing when no
// photos are synced yet, so it's safe to drop on any page.
export async function FbPhotoStrip({
  limit = 8,
  eyebrowKey = "gallery.eyebrow",
  titleKey = "gallery.title",
}: Props = {}) {
  const t = await getTranslations();
  const photos = await getFbPhotos(limit);
  if (photos.length === 0) return null;

  return (
    <section style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="container">
        <div className="section-head" style={{ marginBottom: 32 }}>
          <div>
            <div className="eyebrow"><span>{t(eyebrowKey)}</span></div>
            <h2 className="display display-m" style={{ marginTop: 16 }}>{t(titleKey)}</h2>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((p) => {
            const url = mediaUrl(p.media?.storage_path ?? null);
            if (!url) return null;
            return (
              <div
                key={p.id}
                aria-label={p.alt_text ?? "KÇ Prishtina 038 photo"}
                style={{
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
      </div>
    </section>
  );
}
