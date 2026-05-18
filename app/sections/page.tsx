import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seksionet",
  description: "Pesë disiplina aktive: Rrugë, MTB, Gravel, Akademia e të rinjve, Femra. Trajner i dedikuar dhe kalendar i veçantë për secilën.",
  alternates: { canonical: "/sections" },
};

type Section = {
  slug: string;
  num: string;
  name: string;
  short: string;
  long: string;
  cta: { href: string; label: string };
};

const SECTIONS: Section[] = [
  {
    slug: "road",
    num: "01",
    name: "Rrugë",
    short: "Sezoni i pranverës–vjeshtës. Garat kombëtare të FÇK, Granfondo, dhe etapat rajonale.",
    long:
      "Seksioni themelor i klubit, i themeluar në vitin 2022 dhe i drejtuar nga Albion Ymeri. " +
      "Ekipi numëron sot 12 çiklistë në kategoritë Elite, U23 dhe Masters. " +
      "Stërvitja zhvillohet tri herë në javë — të hënë, të mërkurë dhe të premte në orën 17:30 — me dalje më të gjata grupore çdo të shtunë. " +
      "Garojmë në Tour of Kosovo, në kampionatet kombëtare të FÇK në rrugë dhe krono, në Granfondo Sharri dhe Granfondo Prizren, si dhe në disa Cup të hapura në Shqipëri dhe Maqedoni të Veriut. " +
      "Programi i stërvitjes bazohet në metodologjinë e USAC dhe FCI, i ndarë në blloqe sezonale: bazë (Shkurt–Mars), ngritje (Prill–Maj) dhe garë (Qershor–Tetor).",
    cta: { href: "/join", label: "Apliko për Rrugë" },
  },
  {
    slug: "mtb",
    num: "02",
    name: "MTB",
    short: "Cross-country mbi Germinë, Sharrin dhe Prokletijet. Format XCO dhe maratonë.",
    long:
      "Seksioni i dytë më i madh i klubit, i drejtuar nga Dorant Haxhidauti. " +
      "Stërvitja zhvillohet të martën në orën 18:00 dhe të shtunën në orën 09:00, kryesisht në shtigjet e Germisë, me dalje periodike në Sharr dhe Prokletije. " +
      "Garojmë në kalendarin XCO të FÇK dhe në maratonat rajonale; formati kryesor është cross-country olimpik, me kalim te formatet maratonë gjatë verës. " +
      "Sezoni shtrihet nga Prilli në Tetor. Anëtarësia kushton 25 €/muaj, me zbritje për kategorinë U23. " +
      "Seksioni mban edhe grupin e hapur „Germi Saturday\" për ride pa gara — çdo të shtunë, i hapur për çiklistë jashtë klubit.",
    cta: { href: "/sections/mtb", label: "Hape faqen e MTB" },
  },
  {
    slug: "gravel",
    num: "03",
    name: "Gravel",
    short: "E reja e klubit. Gara aventureske dhe ekspedita të hapura në rrugët dytësore të Kosovës.",
    long:
      "Seksioni më i ri i klubit, themeluar në vitin 2024 dhe i koordinuar nga Qëndrim Pllana. " +
      "Filozofia: më pak garë, më shumë eksplorim. Rrugët dytësore të Kosovës dhe rajonit ofrojnë qindra kilometra të pashkelura nga klubet tjera. " +
      "Grupi numëron sot tetë çiklistë dhe stërvitet të shtunën në orën 08:00 — pika e takimit rrotullohet midis fshatrave përreth Prishtinës. " +
      "Formati kryesor është ride i gjatë 80–180 km, me përgatitje për një gravel race serie të përbashkët me Velo Tirana — sezoni i parë fillon në vitin 2026 me katër etapa.",
    cta: { href: "/join", label: "Apliko për Gravel" },
  },
  {
    slug: "youth",
    num: "04",
    name: "Akademia e të rinjve",
    short: "Çiklistët e ardhshëm të Kosovës — moshat 9–17 vjeç. Stërvitje çdo të shtunë.",
    long:
      "Misioni më i rëndësishëm i klubit, i drejtuar nga Shqiponja Osmani Pllana. " +
      "Akademia mbledh sot 18 çiklistë — 9 vajza dhe 9 djem — të cilët stërviten çdo të shtunë në orën 10:00 në Park-Pyllin e Germisë. " +
      "Programi përfshin aftësi themelore mbi biçikletë, siguri në trafik, mekanikë bazë, gara të vogla brenda klubit dhe udhëtime në kampe verore. " +
      "Pajisjet bazë — helmetë dhe doreza — sigurohen nga klubi për tre muajt e parë. " +
      "Çmimi: falas për çiklistët nën 14 vjeç, dhe 10 €/muaj për moshat 14–17. " +
      "Akademia është krenare që ka tashmë dy çiklistë në ekipin kombëtar U17.",
    cta: { href: "/join", label: "Apliko për fëmijën tuaj" },
  },
  {
    slug: "women",
    num: "05",
    name: "Femra",
    short: "Programi i çiklizmit të femrave — gara, ride të hapura, dhe mentorim ndër-gjenerata.",
    long:
      "Më shumë se një seksion — një rrjet. Programi numëron sot 11 çiklistë në të gjitha disiplinat dhe drejtohet nga Shqiponja Osmani Pllana. " +
      "Çiklistet janë anëtare të seksioneve të rregullta (Rrugë, MTB, Gravel) dhe stërviten sipas seksionit primar, por marrin pjesë në një program shtesë mentorimi që e drejton Shqiponja. " +
      "Çdo të diel në orën 09:00, klubi organizon një ride të hapur nga Lakna e Sahatkullës — për çdo grua që do të provojë çiklizmin për herë të parë, me biçikleta për qira nga BikePlus.",
    cta: { href: "/join", label: "Apliko për programin" },
  },
];

export default async function SectionsPage() {
  const t = await getTranslations();

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow={t("secs.eyebrow")}
        title={t("secs.title")}
        subtitle={t("secs.lede")}
        pickerKey="sections"
      />

      {/* Sections list */}
      <section style={{ padding: "48px 0 64px" }}>
        <div className="container">
          <div className="secs-list">
            {SECTIONS.map(sec => (
              <article key={sec.slug} className="sec-card" id={sec.slug}>
                <header className="sec-card__head">
                  <div className="sec-card__num">{sec.num} · {sec.name.toUpperCase()}</div>
                  <h2 className="sec-card__title">{sec.name}</h2>
                  <p className="sec-card__short">{sec.short}</p>
                </header>

                <div className="sec-card__body">{sec.long}</div>

                <div className="sec-card__cta">
                  <Link href={sec.cta.href as never} className="btn btn-ember btn-sm">
                    <span>{sec.cta.label}</span>
                    <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Join band */}
      <section style={{ padding: "32px 0 64px" }}>
        <div className="container">
          <div className="join-band">
            <div>
              <div className="eyebrow"><span>{t("join.eyebrow")}</span></div>
              <h2 className="mt-16">{t("join.title")}</h2>
              <p className="lede mt-24" style={{ color: "var(--ink-2)" }}>{t("join.lede")}</p>
              <Link href="/join" className="btn btn-ember mt-32">
                <span>{t("join.cta")}</span>
                <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
              </Link>
            </div>
            <div className="perks">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="perk">
                  <span className="num">{String(i).padStart(2, "0")}</span>
                  <span className="text">{t(`join.perk.${i}` as `join.perk.1`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FbPhotoStrip limit={8} />
      <Footer />
    </>
  );
}
