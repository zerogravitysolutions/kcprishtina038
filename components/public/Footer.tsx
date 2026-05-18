import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Footer() {
  const t = await getTranslations();
  return (
    <footer className="foot" id="contact">
      <div className="container">

        {/* ===== Brand row ===== */}
        <div className="foot-brand">
          <Link href="/" className="foot-logo">
            <img src="/assets/logo.jpg" alt="" />
            <div className="foot-logo-text">
              <span className="kc">{t("brand.kc")}</span>
              <span className="sub">{t("brand.sub")}</span>
            </div>
          </Link>
          <p className="foot-tagline">{t("foot.tagline")}</p>
        </div>

        {/* ===== Link columns ===== */}
        <div className="foot-cols">
          <nav className="foot-col" aria-label={t("foot.about")}>
            <h4>{t("foot.about")}</h4>
            <ul>
              <li><Link href="/about">{t("nav.about")}</Link></li>
              <li><Link href={"/about#team" as never}>Ekipi</Link></li>
              <li><Link href={"/about#history" as never}>Historia</Link></li>
              <li><Link href="/news">Lajme</Link></li>
            </ul>
          </nav>

          <nav className="foot-col" aria-label={t("foot.disciplines")}>
            <h4>{t("foot.disciplines")}</h4>
            <ul>
              <li><Link href={"/sections#road" as never}>{t("disc.road.name")}</Link></li>
              <li><Link href="/sections/mtb">{t("disc.mtb.name")}</Link></li>
              <li><Link href={"/sections#gravel" as never}>{t("disc.gravel.name")}</Link></li>
              <li><Link href={"/sections#youth" as never}>{t("disc.youth.name")}</Link></li>
              <li><Link href={"/sections#women" as never}>{t("disc.women.name")}</Link></li>
            </ul>
          </nav>

          <div className="foot-col foot-contact">
            <h4>{t("contact.eyebrow")}</h4>
            <ul>
              <li>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                  <path d="M8 9.5c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M13.5 6.5c0 4-5.5 8-5.5 8s-5.5-4-5.5-8a5.5 5.5 0 0 1 11 0z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>{t("contact.address")}</span>
              </li>
              <li>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                  <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M2.5 4.5 8 9l5.5-4.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <a href={`mailto:${t("contact.email")}`}>{t("contact.email")}</a>
              </li>
              <li>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                  <path d="M3 3.5h2.5l1 2.5L5 7.5a8 8 0 0 0 3.5 3.5l1.5-1.5 2.5 1V13a1 1 0 0 1-1 1A11 11 0 0 1 2 4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <a href="tel:+38338000000">{t("contact.phone")}</a>
              </li>
              <li>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>{t("contact.hours")}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* ===== Bottom row: copyright + federation ===== */}
        <div className="foot-bottom">
          <span>{t("foot.copy")}</span>
          <span className="foot-fed">{t("foot.federation")}</span>
        </div>
      </div>
    </footer>
  );
}
