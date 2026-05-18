import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seksionet",
  description: "Pesë disiplina aktive: Rrugë, MTB, Gravel, Akademia e të rinjve, Femra. Trajner i dedikuar dhe kalendar i veçantë për secilën.",
  alternates: { canonical: "/sections" },
};

type Spec = { k: string; v: string };
type Section = {
  slug: string;
  num: string;
  name: string;
  short: string;
  long: string;
  specs: Spec[];
  cta: { href: string; label: string };
};

const SECTIONS: Section[] = [
  {
    slug: "road",
    num: "01",
    name: "Rrugë",
    short: "Sezoni i pranverës–vjeshtës. Garat kombëtare të FÇK, Granfondo, dhe etapat rajonale.",
    long:
      "Seksioni themelor i klubit. Garojmë në Tour of Kosovo, kampionatet kombëtare të FÇK në rrugë dhe krono, Granfondo Sharri, Granfondo Prizren, dhe disa Cup të hapura në Shqipëri dhe Maqedoni të Veriut. Programi i stërvitjes bazohet në metodologjinë e USAC-së dhe FCI, me blloqe sezonale: bazë (Shkurt–Mars), ngritje (Prill–Maj), garë (Qershor–Tetor).",
    specs: [
      { k: "Trajner", v: "Albion Ymeri" },
      { k: "Çiklistë", v: "12 · Elite, U23, Masters" },
      { k: "Stërvitje", v: "E hënë, e mërkurë, e premte · 17:30" },
      { k: "Vit themelimi", v: "2022" },
    ],
    cta: { href: "/join", label: "Apliko për Rrugë" },
  },
  {
    slug: "mtb",
    num: "02",
    name: "MTB",
    short: "Cross-country mbi Germinë, Sharrin dhe Prokletijet. Format XCO dhe maratonë.",
    long:
      "Seksioni i dytë më i madh i klubit. Stërvitemi në shtigjet e Germisë, Sharrit dhe Prokletijeve dhe garojmë në kalendarin XCO të FÇK, plus në maratonat rajonale. Sezoni: Prill–Tetor. Anëtarësia: 25 €/muaj (zbritur për U23). Seksioni mban edhe një grup të hapur \"Germi Saturday\" për ride pa gara, çdo të shtunë.",
    specs: [
      { k: "Trajner", v: "Dorant Haxhidauti" },
      { k: "Stërvitje", v: "E martë 18:00 · E shtunë 09:00 · Germi" },
      { k: "Formatet", v: "XCO · Marathon" },
    ],
    cta: { href: "/sections/mtb", label: "Hape faqen e MTB" },
  },
  {
    slug: "gravel",
    num: "03",
    name: "Gravel",
    short: "E reja e klubit. Gara aventureske dhe ekspedita të hapura në rrugët dytësore të Kosovës.",
    long:
      "Seksioni më i ri i klubit, themeluar në 2024. Filozofia: më pak garë, më shumë eksplorim. Rrugët dytësore të Kosovës dhe rajonit ofrojnë qindra kilometra të pashkelura nga klubet tjera. Bashkëpunojmë me Velo Tirana për një kalendar të përbashkët gravel race serie që fillon sezonin 2026 me 4 etapa.",
    specs: [
      { k: "Trajner", v: "Qëndrim Pllana" },
      { k: "Çiklistë", v: "8" },
      { k: "Stërvitje", v: "E shtunë 08:00 · Pikë takimi rrotullohet" },
      { k: "Formati", v: "Ride 80–180 km · gravel race serie" },
    ],
    cta: { href: "/join", label: "Apliko për Gravel" },
  },
  {
    slug: "youth",
    num: "04",
    name: "Akademia e të rinjve",
    short: "Çiklistët e ardhshëm të Kosovës — moshat 9–17 vjeç. Stërvitje çdo të shtunë.",
    long:
      "Misioni më i rëndësishëm i klubit. Programi përfshin: aftësi themelore të biçikletës, siguri në trafik, mekanikë bazë, gara të vogla brenda klubit, dhe udhëtime në kampe verore. Pajisjet bazë (helmetë, doreza) sigurohen nga klubi për tre muajt e parë. Akademia është krenare që ka tashmë dy çiklistë në ekipin kombëtar U17.",
    specs: [
      { k: "Trajnere", v: "Shqiponja Osmani Pllana" },
      { k: "Çiklistë", v: "18 · 9 vajza, 9 djem" },
      { k: "Stërvitje", v: "E shtunë 10:00 · Park-Pylli Germi" },
      { k: "Çmimi", v: "Gratis (nën 14 vjeç) · 10 €/muaj (14–17)" },
    ],
    cta: { href: "/join", label: "Apliko për fëmijën tuaj" },
  },
  {
    slug: "women",
    num: "05",
    name: "Femra",
    short: "Programi i çiklizmit të femrave — gara, ride të hapura, dhe mentorim ndër-gjenerata.",
    long:
      "Më shumë se një seksion — një rrjet. Çiklistet janë anëtare të seksioneve të rregullta (Rrugë, MTB, Gravel) por marrin pjesë në një program shtesë mentorimi që e drejton Shqiponja. Çdo të diel në mëngjes, klubi organizon një ride të hapur për çdo grua që do të provojë çiklizmin — me biçikleta për qira nga BikePlus.",
    specs: [
      { k: "Trajnere", v: "Shqiponja Osmani Pllana" },
      { k: "Çiklistë", v: "11 · në të gjitha disiplinat" },
      { k: "Stërvitje", v: "Sipas seksionit primar" },
      { k: "Ride i hapur", v: "E diel 09:00 · Lakna Sahatkulla" },
    ],
    cta: { href: "/join", label: "Apliko për programin" },
  },
];

export default async function SectionsPage() {
  const t = await getTranslations();

  return (
    <>
      <PublicNav />

      {/* Hero */}
      <section className="sections-hero">
        <div className="container">
          <div className="eyebrow"><span>{t("secs.eyebrow")}</span></div>
          <h1 className="display display-l" style={{ marginTop: 16 }}>{t("secs.title")}</h1>
          <p className="lede" style={{ marginTop: 20, maxWidth: 60 + "ch" }}>{t("secs.lede")}</p>
        </div>
      </section>

      {/* Sections list */}
      <section style={{ padding: "8px 0 64px" }}>
        <div className="container">
          <div className="secs-list">
            {SECTIONS.map(sec => (
              <article key={sec.slug} className="sec-card" id={sec.slug}>
                <header className="sec-card__head">
                  <div className="sec-card__num">{sec.num} · {sec.name.toUpperCase()}</div>
                  <h2 className="sec-card__title">{sec.name}</h2>
                  <p className="sec-card__short">{sec.short}</p>
                </header>

                <div className="sec-card__specs">
                  {sec.specs.map(s => (
                    <div key={s.k} className="sec-spec">
                      <div className="sec-spec__k">{s.k}</div>
                      <div className="sec-spec__v">{s.v}</div>
                    </div>
                  ))}
                </div>

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
