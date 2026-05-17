import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/supabase/server";
import { LangToggle } from "./LangToggle";
import { MobileMenu } from "./MobileMenu";

export async function PublicNav() {
  const t = await getTranslations();
  const cookieStore = await cookies();
  const locale = (cookieStore.get("kc038_lang")?.value === "en" ? "en" : "sq") as "sq" | "en";
  const profile = await getProfile();

  let signinLabel = t("nav.signin");
  let signinHref: string = "/login";
  let isAuthed = false;

  if (profile && profile.status === "active") {
    isAuthed = true;
    if (profile.role === "member") {
      signinLabel = t("nav.account");
      signinHref = "/portal";
    } else {
      signinLabel = t("nav.admin");
      signinHref = "/admin/dashboard";
    }
  }

  const links = [
    { href: "/about",    label: t("nav.about") },
    { href: "/sections", label: t("nav.sections") },
    { href: "/events",   label: t("nav.events") },
    { href: "/news",     label: t("nav.news") },
    { href: "/join",     label: t("nav.join") },
  ];

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.jpg" alt="KÇ Prishtina 038" />
          <div className="brand-text">
            <span className="kc">{t("brand.kc")}</span>
            <span className="sub">{t("brand.sub")}</span>
          </div>
        </Link>

        <div className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href as never}>{l.label}</Link>
          ))}
        </div>

        <div className="nav-right">
          <LangToggle current={locale} />
          <Link
            href={signinHref as never}
            className={`nav-signin nav-signin--desktop ${isAuthed ? "is-authed" : ""}`}
          >
            {signinLabel}
          </Link>
          <Link href="/join" className="btn btn-sm btn-ember nav-cta--desktop">
            {t("hero.cta.primary")}
          </Link>
          <MobileMenu
            links={links}
            signin={{ href: signinHref, label: signinLabel, authed: isAuthed }}
            ctaLabel={t("hero.cta.primary")}
            ctaHref="/join"
          />
        </div>
      </div>
    </nav>
  );
}
