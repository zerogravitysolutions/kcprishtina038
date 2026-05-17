import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getFbPage, mediaUrl, type FbPageProfile } from "@/lib/supabase/fb";

type Props = {
  href?: string;
  path?: string;
  page?: FbPageProfile | null;
};

// Dark band linking out to the club's Facebook page. Used on /about and
// /events. Renders nothing if the FB page hasn't been synced yet.
export async function FbFollowBand({ href, path, page: provided }: Props = {}) {
  const t = await getTranslations();
  const page = provided !== undefined ? provided : await getFbPage();
  if (!page) return null;

  const coverUrl = mediaUrl(page.cover?.storage_path);
  const pictureUrl = mediaUrl(page.picture?.storage_path);
  const fbHref = href ?? `https://www.facebook.com/${page.id}${path ?? ""}`;

  return (
    <section className="fb-band">
      <div className="container fb-band__grid">
        {coverUrl && (
          <div className="fb-band__cover">
            <Image
              src={coverUrl}
              alt={page.name ?? "KÇ Prishtina 038"}
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              quality={80}
              style={{ objectFit: "cover" }}
            />
          </div>
        )}
        <div className="fb-band__body">
          <div className="eyebrow" style={{ color: "var(--ember)" }}>
            <span>{t("about.fbStripEyebrow")}</span>
          </div>
          <h2 className="display display-m fb-band__title">
            {t("about.fbStripTitle")}
          </h2>
          <p className="lede fb-band__lede">
            {page.about || t("about.fbStripBody")}
          </p>

          <div className="fb-band__stats mono">
            {typeof page.fan_count === "number" && page.fan_count > 0 && (
              <div>
                <div className="fb-band__num">{page.fan_count.toLocaleString()}</div>
                <div className="fb-band__label">{t("about.fbFans")}</div>
              </div>
            )}
            {page.category && (
              <div>
                <div className="fb-band__num">{page.category}</div>
                <div className="fb-band__label">Facebook</div>
              </div>
            )}
          </div>

          <a
            href={fbHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ember fb-band__cta"
          >
            {pictureUrl && (
              <span className="fb-band__avatar">
                <Image
                  src={pictureUrl}
                  alt=""
                  width={28}
                  height={28}
                  quality={80}
                />
              </span>
            )}
            <span>{t("about.fbStripCta")}</span>
            <svg className="arrow" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </a>
        </div>
      </div>

      <style>{`
        .fb-band {
          background: var(--ink);
          color: var(--paper);
          padding: clamp(56px, 8vw, 96px) 0;
        }
        .fb-band__grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
          gap: clamp(28px, 5vw, 64px);
          align-items: center;
        }
        @media (max-width: 900px) {
          .fb-band__grid { grid-template-columns: 1fr; }
        }
        .fb-band__cover {
          position: relative;
          aspect-ratio: 16 / 9;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid rgba(244, 242, 236, 0.10);
          background: rgba(244, 242, 236, 0.04);
        }
        .fb-band__title {
          color: var(--paper);
          margin-top: 16px;
        }
        .fb-band__lede {
          margin-top: 16px;
          color: var(--slate-2);
          max-width: 52ch;
        }
        .fb-band__stats {
          display: flex;
          gap: 40px;
          margin-top: 28px;
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--slate);
        }
        .fb-band__num {
          font-family: var(--font-display);
          font-size: clamp(24px, 2.5vw, 32px);
          letter-spacing: -0.02em;
          color: var(--paper);
          line-height: 1.1;
        }
        .fb-band__label { margin-top: 4px; }
        .fb-band__cta {
          margin-top: 36px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .fb-band__avatar {
          width: 28px; height: 28px;
          display: inline-block;
          border-radius: 999px;
          overflow: hidden;
          margin-right: 2px;
        }
        .fb-band__avatar img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
      `}</style>
    </section>
  );
}
