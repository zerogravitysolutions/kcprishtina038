import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Footer() {
  const t = await getTranslations();
  return (
    <footer className="foot" id="contact">
      <div className="container">
        <div className="foot-grid">
          <div>
            <div className="brand" style={{ color: "var(--paper)" }}>
              <img src="/assets/logo.jpg" alt="KÇ Prishtina 038" />
              <div className="brand-text">
                <span className="kc">{t("brand.kc")}</span>
                <span className="sub">{t("brand.sub")}</span>
              </div>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2, margin: "24px 0 0", maxWidth: "30ch" }}>
              {t("foot.tagline")}
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate)", marginTop: 24 }}>
              {t("foot.federation")}
            </p>
          </div>
          <div>
            <h4>{t("foot.about")}</h4>
            <ul>
              <li><Link href="/about">{t("nav.about")}</Link></li>
              <li><Link href={"/about#team" as never}>Ekipi</Link></li>
              <li><Link href={"/about#history" as never}>Historia</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t("foot.disciplines")}</h4>
            <ul>
              <li><Link href={"/sections#road" as never}>{t("disc.road.name")}</Link></li>
              <li><Link href="/sections/mtb">{t("disc.mtb.name")}</Link></li>
              <li><Link href={"/sections#gravel" as never}>{t("disc.gravel.name")}</Link></li>
              <li><Link href={"/sections#youth" as never}>{t("disc.youth.name")}</Link></li>
              <li><Link href={"/sections#women" as never}>{t("disc.women.name")}</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t("contact.eyebrow")}</h4>
            <ul>
              <li>{t("contact.address")}</li>
              <li><a href={`mailto:${t("contact.email")}`}>{t("contact.email")}</a></li>
              <li><a href="tel:+38338000000">{t("contact.phone")}</a></li>
              <li style={{ marginTop: 10 }}>{t("contact.hours")}</li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>{t("foot.copy")}</span>
          <span>{t("foot.legal")}</span>
        </div>
      </div>
    </footer>
  );
}
