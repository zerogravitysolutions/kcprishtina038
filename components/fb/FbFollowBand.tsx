import { getTranslations } from "next-intl/server";
import { getFbPage, mediaUrl, type FbPageProfile } from "@/lib/supabase/fb";

type Props = {
  /** Override the FB target URL. Defaults to the page's profile URL. */
  href?: string;
  /** Optional path suffix (e.g. "/events") appended to the FB URL. */
  path?: string;
  /** Pre-fetched page profile. If omitted, the component fetches it. */
  page?: FbPageProfile | null;
};

// Dark band promoting the club's Facebook presence. Reused on the about
// and events pages. Renders nothing if the FB page hasn't been synced yet
// (avoids an empty dark box on first deploy).
export async function FbFollowBand({ href, path, page: provided }: Props = {}) {
  const t = await getTranslations();
  const page = provided !== undefined ? provided : await getFbPage();
  if (!page) return null;

  const coverUrl = mediaUrl(page.cover?.storage_path);
  const pictureUrl = mediaUrl(page.picture?.storage_path);
  const fbHref =
    href ?? `https://www.facebook.com/${page.id}${path ?? ""}`;

  return (
    <section style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 0" }}>
      <div className="container">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: coverUrl ? "minmax(0, 1.2fr) minmax(0, 1fr)" : "1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          {coverUrl && (
            <div
              aria-label={page.name ?? "KÇ Prishtina 038 Facebook cover"}
              style={{
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: 4,
                aspectRatio: "16 / 9",
                border: "1px solid rgba(244,242,236,0.12)",
              }}
            />
          )}
          <div>
            <div className="eyebrow" style={{ color: "var(--ember)" }}>
              <span>{t("about.fbStripEyebrow")}</span>
            </div>
            <h2
              className="display display-m"
              style={{ marginTop: 16, color: "var(--paper)" }}
            >
              {t("about.fbStripTitle")}
            </h2>
            <p
              className="lede"
              style={{ marginTop: 16, color: "var(--slate-2)", maxWidth: "52ch" }}
            >
              {page.about || t("about.fbStripBody")}
            </p>
            <div
              className="mono"
              style={{
                display: "flex",
                gap: 32,
                marginTop: 24,
                fontSize: 12,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "var(--slate)",
              }}
            >
              {typeof page.fan_count === "number" && page.fan_count > 0 && (
                <div>
                  <div style={{ fontSize: 28, color: "var(--paper)", letterSpacing: "-0.02em" }}>
                    {page.fan_count.toLocaleString()}
                  </div>
                  <div>{t("about.fbFans")}</div>
                </div>
              )}
              {page.category && (
                <div>
                  <div style={{ fontSize: 28, color: "var(--paper)", letterSpacing: "-0.02em" }}>
                    {page.category}
                  </div>
                  <div>Facebook</div>
                </div>
              )}
            </div>
            <a
              href={fbHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ember"
              style={{ marginTop: 32 }}
            >
              {pictureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pictureUrl}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: "50%", marginRight: 8 }}
                />
              )}
              <span>{t("about.fbStripCta")}</span>
              <svg className="arrow" viewBox="0 0 14 14" fill="none">
                <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
