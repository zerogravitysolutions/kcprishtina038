import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/supabase/server";
import { LangToggle } from "./LangToggle";

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

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <img src="/assets/logo.jpg" alt="KÇ Prishtina 038" />
          <div className="brand-text">
            <span className="kc">{t("brand.kc")}</span>
            <span className="sub">{t("brand.sub")}</span>
          </div>
        </Link>
        <div className="nav-links">
          <Link href="/about">{t("nav.about")}</Link>
          <Link href="/sections">{t("nav.sections")}</Link>
          <Link href="/events">{t("nav.events")}</Link>
          <Link href="/join">{t("nav.join")}</Link>
        </div>
        <div className="nav-right">
          <LangToggle current={locale} />
          <Link href={signinHref as never} className={`nav-signin ${isAuthed ? "is-authed" : ""}`}>
            {signinLabel}
          </Link>
          <Link href="/join" className="btn btn-sm btn-ember">
            {t("hero.cta.primary")}
          </Link>
        </div>
      </div>
    </nav>
  );
}
