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
              <li><Link href="/team">Ekipi</Link></li>
              <li><Link href={"/about#history" as never}>Historia</Link></li>
              <li><Link href="/news">Lajmet</Link></li>
            </ul>
          </nav>

          <nav className="foot-col" aria-label={t("foot.disciplines")}>
            <h4>{t("foot.disciplines")}</h4>
            <ul>
              <li><Link href={"/#disciplines" as never}>{t("disc.road.name")}</Link></li>
              <li><Link href="/sections/mtb">{t("disc.mtb.name")}</Link></li>
              <li><Link href={"/#disciplines" as never}>{t("disc.gravel.name")}</Link></li>
              <li><Link href={"/#disciplines" as never}>{t("disc.youth.name")}</Link></li>
              <li><Link href={"/#disciplines" as never}>{t("disc.women.name")}</Link></li>
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
                <a href="https://www.facebook.com/119279937733925" target="_blank" rel="noopener noreferrer">
                  {t("contact.facebook")}
                </a>
              </li>
              <li><Link href="/">prishtinacycling.com</Link></li>
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

        {/* ===== Bottom row: copyright, site credit and federation ===== */}
        <div className="foot-bottom">
          <div>
            <div>{t("foot.copy", { year: new Date().getFullYear() })}</div>
            <div style={{ marginTop: 8 }}>{t("foot.credit")}</div>
          </div>
          <span className="foot-fed">{t("foot.federation")}</span>
        </div>
      </div>
    </footer>
  );
}
