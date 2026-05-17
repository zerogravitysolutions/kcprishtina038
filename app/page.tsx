import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Countdown } from "@/components/landing/Countdown";
import { createClient } from "@/lib/supabase/server";
import { getRecentFbPosts, getFbPhotos, mediaUrl, postTitle, postBody, formatPostDate } from "@/lib/supabase/fb";

type NextRace = {
  title_sq: string; start_at: string; location: string | null;
  distance_km: number | null; elevation_m: number | null; description_sq: string | null;
};
type SectionRow = { slug: string; name_sq: string; description_sq: string | null };
type NewsRow = { slug: string; title_sq: string; body_sq: string; published_at: string | null; tags: string[] };
type SponsorRow = { name: string; tier: string; role_sq: string | null; body_sq: string | null };

async function fetchHomeData() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [nextRace, sections, news, sponsors, fbPhotos, fbPosts] = await Promise.all([
    supabase.from("events")
      .select("title_sq, start_at, location, distance_km, elevation_m, description_sq")
      .eq("type", "race").eq("status", "published")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(1).maybeSingle(),
    supabase.from("sections")
      .select("slug, name_sq, description_sq")
      .eq("active", true).order("display_order"),
    supabase.from("news")
      .select("slug, title_sq, body_sq, published_at, tags")
      .eq("status", "published")
      .order("published_at", { ascending: false }).limit(3),
    supabase.from("sponsors")
      .select("name, tier, role_sq, body_sq, website_url, display_order")
      .eq("active", true).order("display_order"),
    getFbPhotos(3),
    getRecentFbPosts(3),
  ]);

  return {
    nextRace: (nextRace.data as NextRace | null) ?? null,
    sections: (sections.data as SectionRow[] | null) ?? [],
    news: (news.data as NewsRow[] | null) ?? [],
    sponsors: (sponsors.data as SponsorRow[] | null) ?? [],
    fbPhotos,
    fbPosts,
  };
}

export default async function Home() {
  const t = await getTranslations();
  const { nextRace, sections, news, sponsors, fbPhotos, fbPosts } = await fetchHomeData();
  // Hero collage uses real FB photos when available; otherwise the labeled
  // placeholder boxes remain (existing behavior preserved).
  const heroSlots: Array<{ url: string | null; alt: string }> = [0, 1, 2].map(i => {
    const p = fbPhotos[i];
    return { url: mediaUrl(p?.media?.storage_path ?? null), alt: p?.alt_text ?? "" };
  });
  // News strip: native news first, fall back to FB posts to fill empty slots.
  const newsHasNative = news.length > 0;

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
                <span>{t("hero.title.1")}</span>
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
                    <div
                      key={slot}
                      className={`slot ${slot}`}
                      style={{
                        backgroundImage: `url(${photo.url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                      aria-label={photo.alt || "KÇ Prishtina 038 photo"}
                    />
                  );
                }
                const labels = ["Team riding · hero photo", "Race · portrait", "Training · landscape"] as const;
                return <div key={slot} className={`slot ${slot}`}><span>{labels[i]}</span></div>;
              })}
              <div className="stamp">
                <span>EKIPI · 2026</span>
                <strong>47 ÇIKLISTË</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS STRIP ============ */}
      <div className="container">
        <div className="stats-strip">
          <div className="stat">
            <div className="num mono">{t("stats.km.num")}</div>
            <div className="label">{t("stats.km.label")}</div>
          </div>
          <div className="stat">
            <div className="num mono">{t("stats.podium.num")}</div>
            <div className="label">{t("stats.podium.label")}</div>
          </div>
          <div className="stat">
            <div className="num mono">{t("stats.juniors.num")}</div>
            <div className="label">{t("stats.juniors.label")}</div>
          </div>
          <div className="stat">
            <div className="num mono">{t("stats.years.num")}</div>
            <div className="label">{t("stats.years.label")}</div>
          </div>
        </div>
      </div>

      {/* ============ COUNTDOWN ============ */}
      <section>
        <div className="container">
          <div className="countdown-band">
            <div>
              <div className="cd-status"><span className="cd-dot"></span><span>{t("cd.status")}</span></div>
              <h2 className="display display-l" style={{ color: "var(--paper)", marginTop: 16 }}>{raceTitle}</h2>
              <p className="mono" style={{ fontSize: 13, letterSpacing: ".06em", color: "var(--slate)", marginTop: 16 }}>{raceSubtitle}</p>
              <p className="mono" style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--slate-2)", marginTop: 24 }}>{t("cd.detail")}</p>
              <Link href="/events" className="btn btn-ember" style={{ marginTop: 28 }}>
                <span>{t("cd.cta")}</span>
                <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
              </Link>
            </div>
            <Countdown targetIso={raceTargetIso} />
          </div>
        </div>
      </section>

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

      {/* ============ NEWS ============ */}
      {(newsHasNative || fbPosts.length > 0) && (
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
              {newsHasNative
                ? news.map((n) => (
                    <article key={n.slug} className="news-card">
                      <div className="ph"><span className="ph-label">FOTO</span><span className="ph-corner">JPG · 4:3</span></div>
                      <span className="date mono">
                        {n.published_at ? new Date(n.published_at).toLocaleDateString("sq", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}
                        {n.tags?.[0] ? " · " + n.tags[0].toUpperCase() : ""}
                      </span>
                      <h3>{n.title_sq}</h3>
                      <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
                        {(n.body_sq || "").replace(/\s+/g, " ").slice(0, 200)}{(n.body_sq || "").length > 200 ? "…" : ""}
                      </p>
                    </article>
                  ))
                : fbPosts.map((p) => {
                    const imgUrl = mediaUrl(p.cover?.storage_path ?? null);
                    const title = postTitle(p);
                    const body = postBody(p);
                    const Wrapper = (props: { children: React.ReactNode }) =>
                      p.permalink_url ? (
                        <a href={p.permalink_url} target="_blank" rel="noopener noreferrer" className="news-card" style={{ textDecoration: "none", color: "inherit" }}>
                          {props.children}
                        </a>
                      ) : (
                        <article className="news-card">{props.children}</article>
                      );
                    return (
                      <Wrapper key={p.id}>
                        {imgUrl ? (
                          <div
                            className="ph"
                            style={{
                              backgroundImage: `url(${imgUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                        ) : (
                          <div className="ph"><span className="ph-label">FACEBOOK</span><span className="ph-corner">POST</span></div>
                        )}
                        <span className="date mono">{formatPostDate(p.created_time)} · FACEBOOK</span>
                        <h3>{title || "KÇ Prishtina 038"}</h3>
                        {body && (
                          <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>{body}</p>
                        )}
                      </Wrapper>
                    );
                  })}
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
