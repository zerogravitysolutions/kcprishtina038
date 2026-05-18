import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Countdown } from "@/components/landing/Countdown";
import { NewsCard } from "@/components/ui/NewsCard";
import { createClient } from "@/lib/supabase/server";
import { getRecentNews, getHeroPhotos, mediaUrl } from "@/lib/supabase/fb";
import { memberInitials, memberPhotoUrl, type TeamMemberCard } from "@/lib/supabase/team";

type NextRace = {
  title_sq: string; start_at: string; location: string | null;
  distance_km: number | null; elevation_m: number | null; description_sq: string | null;
};
type SectionRow = { slug: string; name_sq: string; description_sq: string | null };
type SponsorRow = { name: string; tier: string; role_sq: string | null; body_sq: string | null };

const FOUNDING_YEAR = 2022;

// Short blurb per founder for the landing card — kept here so the page
// stays self-contained without adding a column to team_members for it.
const FOUNDER_BLURBS: Record<string, string> = {
  "qendrim-pllana":           "Themeloi klubin si president dhe sot drejton zhvillimin sportiv, kalendarin garues dhe marrëdhëniet me FÇK.",
  "albion-ymeri":             "Trajner kryesor dhe çiklist garues — fitues i Cross Country Prishtina 2023 dhe i Kampionatit të Triatlonit.",
  "shqiponja-osmani-pllana":  "Drejton programet e femrave dhe akademinë e të rinjve, dy kolonat me të cilat klubi po e rikthen brezin e ri në biçikletë.",
};

async function fetchHomeData() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const FOUNDER_SLUGS = ["qendrim-pllana", "albion-ymeri", "shqiponja-osmani-pllana"];
  const FOUNDER_ROLES: Record<string, string> = {
    "qendrim-pllana":         "Themelues · President",
    "albion-ymeri":           "Themelues · Trajner kryesor",
    "shqiponja-osmani-pllana": "Themelueze · Programe të femrave",
  };

  const [nextRace, sections, news, sponsors, fbPhotos, riderC, raceEventC, foundersRaw] = await Promise.all([
    supabase.from("events")
      .select("title_sq, start_at, location, distance_km, elevation_m, description_sq")
      .eq("type", "race").eq("status", "published")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(1).maybeSingle(),
    supabase.from("sections")
      .select("slug, name_sq, description_sq")
      .eq("active", true).order("display_order"),
    getRecentNews(3),
    supabase.from("sponsors")
      .select("name, tier, role_sq, body_sq, website_url, display_order")
      .eq("active", true).order("display_order"),
    getHeroPhotos(3),
    // Active riders only (members with the 'rider' position).
    supabase.from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active").contains("positions", ["rider"]),
    // Distinct race events from the curated race_events catalog.
    supabase.from("race_events")
      .select("id", { count: "exact", head: true }),
    supabase.from("team_members")
      .select("id, slug, full_name, first_name, last_name, gender, dob, positions, section_slug, bio, status, ended_at, display_order, external_photo_url, photo:media!photo_media_id(storage_path)")
      .in("slug", FOUNDER_SLUGS),
  ]);

  const founderMap = new Map<string, TeamMemberCard>();
  for (const m of (foundersRaw.data as unknown as TeamMemberCard[] | null) ?? []) {
    founderMap.set(m.slug, m);
  }
  const founders = FOUNDER_SLUGS
    .map(slug => {
      const m = founderMap.get(slug);
      return m ? { member: m, role: FOUNDER_ROLES[slug] } : null;
    })
    .filter((x): x is { member: TeamMemberCard; role: string } => x !== null);

  const yearsOnCalendar = new Date().getFullYear() - FOUNDING_YEAR;

  return {
    nextRace: (nextRace.data as NextRace | null) ?? null,
    sections: (sections.data as SectionRow[] | null) ?? [],
    news,
    sponsors: (sponsors.data as SponsorRow[] | null) ?? [],
    fbPhotos,
    founders,
    stats: {
      activeRiders: riderC.count ?? 0,
      sectionsActive: (sections.data as SectionRow[] | null)?.length ?? 0,
      raceEvents: raceEventC.count ?? 0,
      yearsOnCalendar,
    },
  };
}

export default async function Home() {
  const t = await getTranslations();
  const { nextRace, sections, news, sponsors, fbPhotos, founders, stats } = await fetchHomeData();
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  // Hero collage uses real FB photos when available; otherwise the labeled
  // placeholder boxes remain (existing behavior preserved).
  const heroSlots: Array<{ url: string | null; alt: string }> = [0, 1, 2].map(i => {
    const p = fbPhotos[i];
    return { url: mediaUrl(p?.media?.storage_path ?? null), alt: p?.alt_text ?? "" };
  });

  // Race target: DB-driven if a future published race exists, else fallback.
  const raceTargetIso = nextRace?.start_at ?? "2026-05-17T09:00:00";
  const raceTitle = nextRace?.title_sq ?? t("cd.title");
  const raceSubtitleParts = [
    nextRace?.location,
    nextRace?.distance_km ? `${nextRace.distance_km} km` : null,
    nextRace?.elevation_m ? `${nextRace.elevation_m} m ngritje` : null,
  ].filter(Boolean) as string[];
  const raceSubtitle = raceSubtitleParts.length ? raceSubtitleParts.join(" · ") : t("cd.subtitle");

  return (
    <>
      <PublicNav />

      {/* ============ HERO v2 ============ */}
      <section className="hero-v2">
        <span className="ghost" aria-hidden="true">038</span>
        <svg className="topo" preserveAspectRatio="none" viewBox="0 0 1600 900" aria-hidden="true">
          <defs>
            <pattern id="hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M56 0 H0 V56" stroke="rgba(244,242,236,.05)" fill="none" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1600" height="900" fill="url(#hero-grid)" />
          <path d="M0 720 Q 240 660 480 690 T 960 640 T 1600 600" stroke="rgba(111,170,168,.18)" fill="none" strokeWidth="1" />
          <path d="M0 780 Q 240 720 480 750 T 960 700 T 1600 660" stroke="rgba(111,170,168,.12)" fill="none" strokeWidth="1" />
          <path d="M0 840 Q 240 780 480 810 T 960 760 T 1600 720" stroke="rgba(111,170,168,.08)" fill="none" strokeWidth="1" />
        </svg>

        <div className="rail">
          <span className="pulse">SEZONI 2026 · ACTIVE</span>
          <span>·</span>
          <span>UCI · ECU · FÇK</span>
          <span>·</span>
          <span>PRISHTINË · KOSOVA</span>
        </div>

        <div className="container">
          <div className="hero-top">
            <div className="l"><span>KÇ Prishtina 038 · est. 2022</span></div>
            <div className="c">
              <span className="live"><span className="dot"></span> {t("hero.eyebrow")}</span>
            </div>
            <div className="r"><span>42° 39′ N · 21° 09′ E</span></div>
          </div>

          <div className="hero-grid">
            <div>
              <h1>
                <span>{t("hero.title.1")}</span>{" "}
                <span>{t("hero.title.2")}</span><em>{t("hero.title.em")}</em><span>{t("hero.title.3")}</span><br />
                <span>{t("hero.title.4")}</span>
              </h1>
              <p className="hero-lede">{t("hero.lede")}</p>
              <div className="cta-row">
                <Link href="/join" className="btn btn-ember">
                  <span>{t("hero.cta.primary")}</span>
                  <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
                </Link>
                <Link href="/sections" className="btn btn-ghost">{t("hero.cta.ghost")}</Link>
              </div>
            </div>

            <div className="collage">
              <span className="badge">SEZONI 2026 · LIVE</span>
              {(["s1", "s2", "s3"] as const).map((slot, i) => {
                const photo = heroSlots[i];
                if (photo.url) {
                  return (
                    <div key={slot} className={`slot ${slot}`} style={{ position: "relative", overflow: "hidden" }}>
                      <Image
                        src={photo.url}
                        alt={photo.alt || "KÇ Prishtina 038"}
                        fill
                        sizes="(max-width: 900px) 50vw, 25vw"
                        priority={i === 0}
                        quality={80}
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  );
                }
                const labels = ["Team riding · hero photo", "Race · portrait", "Training · landscape"] as const;
                return <div key={slot} className={`slot ${slot}`}><span>{labels[i]}</span></div>;
              })}
              <div className="stamp">
                <span>EKIPI · {new Date().getFullYear()}</span>
                <strong>{stats.activeRiders} ÇIKLISTË</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS STRIP — live counts from DB ============ */}
      <div className="container">
        <div className="stats-strip">
          <div className="stat">
            <div className="num mono">{pad2(stats.activeRiders)}</div>
            <div className="label">Çiklistë aktivë</div>
          </div>
          <div className="stat">
            <div className="num mono">{stats.raceEvents}</div>
            <div className="label">Garat e regjistruara</div>
          </div>
          <div className="stat">
            <div className="num mono">{pad2(stats.sectionsActive)}</div>
            <div className="label">Disiplina aktive</div>
          </div>
          <div className="stat">
            <div className="num mono">{pad2(stats.yearsOnCalendar)}</div>
            <div className="label">Vite në kalendar</div>
          </div>
        </div>
      </div>

      {/* ============ COUNTDOWN ============ */}
      {/* Only renders when a real future event exists in the DB. Otherwise
          we'd be showing a stale placeholder date — drop the band entirely. */}
      {nextRace && (
        <section>
          <div className="container">
            <div className="countdown-band">
              <div>
                <div className="cd-status"><span className="cd-dot"></span><span>{t("cd.status")}</span></div>
                <h2 className="display display-l" style={{ color: "var(--paper)", marginTop: 16 }}>{raceTitle}</h2>
                <p className="mono" style={{ fontSize: 13, letterSpacing: ".06em", color: "var(--slate)", marginTop: 16 }}>{raceSubtitle}</p>
                <p className="mono" style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--slate-2)", marginTop: 24 }}>{t("cd.detail")}</p>
                <Link href={"/races" as never} className="btn btn-ember" style={{ marginTop: 28 }}>
                  <span>{t("cd.cta")}</span>
                  <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
                </Link>
              </div>
              <Countdown targetIso={raceTargetIso} />
            </div>
          </div>
        </section>
      )}

      {/* ============ DISCIPLINES ============ */}
      <section style={{ background: "var(--paper-2)" }}>
        <div className="container">
          <div className="section-head">
            <div>
              <div className="eyebrow"><span>{t("disc.eyebrow")}</span></div>
              <h2 className="display display-m" style={{ marginTop: 16 }}>{t("disc.title")}</h2>
            </div>
            <p className="lede">{t("disc.lede")}</p>
          </div>
          <div className="disc-grid">
            {sections.map((sec, i) => (
              <Link
                key={sec.slug}
                href={(sec.slug === "mtb" ? "/sections/mtb" : `/sections#${sec.slug}`) as never}
                className="disc-card"
              >
                <div className="num">{String(i + 1).padStart(2, "0")} / {sec.name_sq.toUpperCase()}</div>
                <h3>{sec.name_sq}</h3>
                <p>{sec.description_sq}</p>
                <div className="meta">
                  <span></span>
                  <span className="go">
                    <span>{t("disc.go")}</span>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ THEMELUESIT ============ */}
      {founders.length > 0 && (
        <section className="founders-section">
          <div className="container">
            <div className="section-head">
              <div>
                <div className="eyebrow"><span>Themeluesit</span></div>
                <h2 className="display display-m" style={{ marginTop: 16 }}>Tre themelues. Një ide e qartë.</h2>
              </div>
              <p className="lede">
                KÇ Prishtina 038 lindi në vitin 2022 nga tre çiklistë që besuan se Prishtina e meriton një klub me identitet të vetin —
                me kalendar, me akademinë e të rinjve dhe me një ekip që garon jashtë kufirit.
              </p>
            </div>
            <div className="founders-grid">
              {founders.map(({ member, role }, idx) => {
                const photo = memberPhotoUrl(member);
                const blurb = FOUNDER_BLURBS[member.slug] ?? "";
                return (
                  <Link
                    key={member.slug}
                    href={`/team/${member.slug}` as never}
                    className={`founder-card ${photo ? "" : "founder-card--noimg"}`}
                  >
                    <div className="founder-photo">
                      <span className="founder-index">{String(idx + 1).padStart(2, "0")} / 03</span>
                      {photo ? (
                        <Image src={photo} alt={member.full_name} fill sizes="(max-width: 900px) 100vw, 33vw" quality={80} style={{ objectFit: "cover" }} />
                      ) : (
                        <span className="founder-initials">{memberInitials(member)}</span>
                      )}
                    </div>
                    <div className="founder-meta">
                      <div className="founder-role">{role}</div>
                      <div className="founder-name">{member.full_name}</div>
                      {blurb && <p className="founder-blurb">{blurb}</p>}
                      <span className="founder-go" aria-hidden="true">
                        <span>Lexo profilin</span>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ============ HISTORIA ============ */}
      <section style={{ background: "var(--paper-2)" }}>
        <div className="container">
          <div className="section-head">
            <div>
              <div className="eyebrow"><span>Historia</span></div>
              <h2 className="display display-m" style={{ marginTop: 16 }}>Katër vite në kalendar.</h2>
            </div>
            <Link href={"/about" as never} className="btn btn-ghost" style={{ justifySelf: "start" }}>
              <span>Historia e plotë</span>
              <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
            </Link>
          </div>
          <div className="history-grid">
            <div className="history-step">
              <div className="history-year mono">2022</div>
              <h3>Themelimi</h3>
              <p>Klubi regjistrohet pranë FÇK. Qëndrim Pllana, Albion Ymeri dhe Shqiponja Osmani Pllana hapin seksionin e parë — Rrugë.</p>
            </div>
            <div className="history-step">
              <div className="history-year mono">2023</div>
              <h3>Triumfe të para</h3>
              <p>Albion Ymeri triumfon në Cross Country Prishtina (Germi) dhe në Kampionatin e Triatlonit. Hapet seksioni i MTB-së.</p>
            </div>
            <div className="history-step">
              <div className="history-year mono">2024</div>
              <h3>Zgjerimi</h3>
              <p>Klubi hap seksionet Gravel, Akademia e të rinjve dhe programi i femrave. Fillon bashkëpunimi me BikePlus dhe Novus.</p>
            </div>
            <div className="history-step">
              <div className="history-year mono">2025</div>
              <h3>Kupa Prishtina</h3>
              <p>Klubi organizon edicionin e parë të Kupës së Prishtinës. Sezoni mbyllet me 23 pozita në podium kombëtar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ NEWS ============ */}
      {news.length > 0 && (
        <section id="news">
          <div className="container">
            <div className="section-head">
              <div>
                <div className="eyebrow"><span>{t("news.eyebrow")}</span></div>
                <h2 className="display display-m" style={{ marginTop: 16 }}>{t("news.title")}</h2>
              </div>
              <Link href={"/news" as never} className="btn btn-ghost" style={{ justifySelf: "start" }}>
                <span>{t("news.cta")}</span>
                <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
              </Link>
            </div>
            <div className="news-grid">
              {news.map((n) => (
                <NewsCard key={n.slug} news={n} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ SPONSORS ============ */}
      {sponsors.length > 0 && (
        <section>
          <div className="container">
            <div className="section-head">
              <div>
                <div className="eyebrow"><span>{t("sponsors.eyebrow")}</span></div>
                <h2 className="display display-m" style={{ marginTop: 16 }}>{t("sponsors.title")}</h2>
              </div>
            </div>
            <div className="sponsors">
              {sponsors.map((s) => (
                <div key={s.name} className="sponsor">
                  <div className="logo-box" style={s.tier === "title" ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" } : undefined}>
                    {s.name}
                  </div>
                  <div>
                    <div className="name">{s.name}</div>
                    <div className="role">{s.role_sq || s.tier}</div>
                    <p>{s.body_sq}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ JOIN BAND ============ */}
      <section>
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

      <Footer />
    </>
  );
}
