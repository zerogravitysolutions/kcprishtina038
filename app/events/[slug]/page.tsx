import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Countdown } from "@/components/landing/Countdown";
import { StravaEmbed } from "@/components/public/StravaEmbed";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/supabase/fb";
import { CATEGORIES } from "@/lib/race-category";
import { RegisterForm } from "./RegisterForm";

type Params = Promise<{ slug: string }>;

type EventRow = {
  id: string;
  slug: string;
  title_sq: string;
  title_en: string | null;
  type: string;
  status: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  description_sq: string | null;
  description_en: string | null;
  registration_open_at: string | null;
  registration_close_at: string | null;
  external_url: string | null;
  strava_url: string | null;
  source: string | null;
  results_published: boolean;
  results_published_at: string | null;
  cover: { storage_path: string } | null;
};

type PublicResultRow = {
  full_name: string;
  club: string | null;
  gender: string | null;
  category: string | null;
  bib_number: number | null;
  result_place: number | null;
  result_time: string | null;
  result_notes: string | null;
};

type EventSponsorRow = {
  id: string;
  name: string;
  tier: string;
  role_sq: string | null;
  website_url: string | null;
  logo: { storage_path: string } | null;
};

const EVENT_SELECT =
  "id, slug, title_sq, title_en, type, status, start_at, end_at, location, " +
  "distance_km, elevation_m, description_sq, description_en, " +
  "registration_open_at, registration_close_at, external_url, strava_url, source, " +
  "results_published, results_published_at, " +
  "cover:media!cover_media_id(storage_path)";

function isStravaUrl(url: string | null): boolean {
  if (!url) return false;
  return /strava\.com\/(routes|segments|activities)\/\d+/i.test(url);
}

async function getEvent(slug: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as unknown as EventRow | null) ?? null;
}

async function getPublicResults(eventId: string): Promise<PublicResultRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_signups")
    .select("full_name, club, gender, category, bib_number, result_place, result_time, result_notes")
    .eq("event_id", eventId)
    .in("status", ["confirmed", "pending"])
    .order("result_place", { ascending: true, nullsFirst: false });
  return (data as PublicResultRow[] | null) ?? [];
}

async function getEventSponsors(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sponsors")
    .select("id, name, tier, role_sq, website_url, logo:media!logo_media_id(storage_path)")
    .eq("event_id", eventId)
    .eq("active", true)
    .order("display_order");
  return (data as unknown as EventSponsorRow[] | null) ?? [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev) return { title: "Gara nuk u gjet" };
  const description = (ev.description_sq || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: ev.title_sq,
    description: description || undefined,
    alternates: { canonical: `/events/${ev.slug}` },
    openGraph: ev.cover?.storage_path ? { images: [mediaUrl(ev.cover.storage_path)!] } : undefined,
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("sq-AL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" });
}

export default async function EventDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev) notFound();
  const [sponsors, results] = await Promise.all([
    getEventSponsors(ev.id),
    ev.results_published ? getPublicResults(ev.id) : Promise.resolve([] as PublicResultRow[]),
  ]);

  const coverUrl = mediaUrl(ev.cover?.storage_path ?? null);
  const stravaOk = isStravaUrl(ev.strava_url);
  const now = new Date();
  const closeAt = ev.registration_close_at ? new Date(ev.registration_close_at) : null;
  const openAt = ev.registration_open_at ? new Date(ev.registration_open_at) : null;
  const eventStarted = new Date(ev.start_at) <= now;
  // Registration is hidden once results go public OR the event has started.
  const regOpen =
    !ev.results_published &&
    !eventStarted &&
    (!openAt || openAt <= now) &&
    (!closeAt || closeAt >= now);
  const isFb = ev.source === "facebook";

  return (
    <>
      <PublicNav />

      <article>
        {/* Header */}
        <header style={{ paddingTop: 96, paddingBottom: 32 }}>
          <div className="container" style={{ maxWidth: 1024 }}>
            <Link
              href="/races"
              className="mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                color: "var(--ink-2)", textDecoration: "none", opacity: 0.7,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M11 11 L3 3 M3 3 H9 M3 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Të gjitha garat</span>
            </Link>

            <div
              className="mono"
              style={{
                marginTop: 32, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
                color: "var(--ember)",
              }}
            >
              {formatDate(ev.start_at)} <span style={{ color: "var(--ink-3)" }}>·</span> {formatTime(ev.start_at)}
            </div>

            <h1
              className="display"
              style={{
                marginTop: 16,
                fontSize: "clamp(36px, 5vw, 64px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              {ev.title_sq}
            </h1>

            {/* Fast facts row */}
            <div
              style={{
                marginTop: 32,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 16,
              }}
            >
              {ev.location && (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Vendi</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>{ev.location}</div>
                </div>
              )}
              {ev.distance_km != null && (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Distanca</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>{ev.distance_km} km</div>
                </div>
              )}
              {ev.elevation_m != null && (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Ngritja</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>{ev.elevation_m} m</div>
                </div>
              )}
              {closeAt && (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Regjistrimi mbyllet</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>{formatDate(closeAt.toISOString())}</div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Cover */}
        {coverUrl && (
          <div className="container" style={{ maxWidth: 1240, marginTop: 8 }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--paper-2)",
              }}
            >
              <Image
                src={coverUrl}
                alt={ev.title_sq}
                fill
                sizes="(max-width: 1240px) 100vw, 1240px"
                priority
                quality={85}
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        )}

        {/* Countdown — only when the event is still in the future */}
        {new Date(ev.start_at) > new Date() && (
          <div className="container" style={{ maxWidth: 1240, marginTop: 32 }}>
            <div
              style={{
                background: "var(--ink)",
                color: "var(--paper)",
                borderRadius: 18,
                padding: "28px 32px",
                display: "grid",
                gridTemplateColumns: "1.2fr 1.4fr",
                gap: 32,
                alignItems: "center",
              }}
              className="event-countdown-band"
            >
              <div>
                <div className="cd-status">
                  <span className="cd-dot"></span>
                  <span>Numëron mbrapsht</span>
                </div>
                <p
                  className="mono"
                  style={{
                    marginTop: 12,
                    fontSize: 11,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: "var(--slate)",
                  }}
                >
                  {formatDate(ev.start_at)} · {formatTime(ev.start_at)}
                </p>
                {ev.location && (
                  <p
                    className="mono"
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      letterSpacing: ".05em",
                      color: "var(--slate-2)",
                    }}
                  >
                    {ev.location}
                  </p>
                )}
              </div>
              <Countdown targetIso={ev.start_at} />
            </div>
          </div>
        )}

        {/* Results — only when publicly published. Lives high up the page
            (right under the cover) because the race is already over and the
            ranking is the headline. */}
        {ev.results_published && (
          <ResultsBlock results={results} eventStartIso={ev.start_at} />
        )}

        {/* Description */}
        {ev.description_sq && (
          <div className="container" style={{ maxWidth: 720, marginTop: 56 }}>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "clamp(17px, 1.15vw, 19px)",
                lineHeight: 1.7,
                color: "var(--ink)",
                whiteSpace: "pre-wrap",
              }}
            >
              {ev.description_sq}
            </div>
          </div>
        )}

        {/* Strava route / segment / activity — width matches the cover +
            countdown band above (1240px container). */}
        {ev.strava_url && (
          <div className="container" style={{ maxWidth: 1240, marginTop: 56 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              <span>Rruga (Strava)</span>
            </div>

            {stravaOk ? (
              <StravaEmbed url={ev.strava_url} />
            ) : (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
                Linku i Strava-s nuk u njoh si rrugë, segment ose aktivitet —
                kontrollo URL-në në panelin e admin.
              </p>
            )}

            <a
              href={ev.strava_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
                fontSize: 11,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "var(--ember)",
                textDecoration: "none",
              }}
            >
              <span>Hap në Strava</span>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </a>
          </div>
        )}

        {/* Sponsors for this event */}
        {sponsors.length > 0 && (
          <section style={{ marginTop: 72, paddingTop: 32, paddingBottom: 32, background: "var(--paper-2)" }}>
            <div className="container" style={{ maxWidth: 1024 }}>
              <div className="eyebrow" style={{ marginBottom: 20 }}>
                <span>Sponsorët e garës</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                {sponsors.map((s) => {
                  const logoUrl = mediaUrl(s.logo?.storage_path ?? null);
                  const TileWrap = ({ children }: { children: React.ReactNode }) =>
                    s.website_url ? (
                      <a
                        href={s.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
                      >
                        {children}
                      </a>
                    ) : (
                      <div style={{ height: "100%" }}>{children}</div>
                    );
                  return (
                    <TileWrap key={s.id}>
                      <div
                        style={{
                          height: "100%",
                          background: "var(--paper)",
                          border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)",
                          borderRadius: 10,
                          padding: "20px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          minHeight: 140,
                        }}
                      >
                        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                          {logoUrl ? (
                            <div style={{ position: "relative", width: "100%", height: 48 }}>
                              <Image
                                src={logoUrl}
                                alt={s.name}
                                fill
                                sizes="(max-width: 900px) 40vw, 180px"
                                quality={85}
                                style={{ objectFit: "contain", objectPosition: "left center" }}
                              />
                            </div>
                          ) : (
                            <div
                              className="display"
                              style={{ fontSize: 22, letterSpacing: "-0.02em", color: "var(--ink)" }}
                            >
                              {s.name}
                            </div>
                          )}
                        </div>
                        <div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 10,
                              letterSpacing: ".14em",
                              textTransform: "uppercase",
                              color: "var(--ember)",
                            }}
                          >
                            {s.tier}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{s.name}</div>
                          {s.role_sq && (
                            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                              {s.role_sq}
                            </div>
                          )}
                        </div>
                      </div>
                    </TileWrap>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Registration — only when results haven't been published yet. */}
        {!ev.results_published && (
          <section style={{ marginTop: 72, paddingBottom: 72 }}>
            <div className="container" style={{ maxWidth: 1024 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                <span>Regjistrimi</span>
              </div>
              <h2 className="display display-m" style={{ marginTop: 0, marginBottom: 24 }}>
                {regOpen ? "Bashkohu në startlist" : "Regjistrimi i mbyllur"}
              </h2>

              {isFb ? (
                <p style={{ color: "var(--ink-2)", maxWidth: 720, lineHeight: 1.65 }}>
                  Kjo garë është importuar nga Facebook. Për regjistrim ndiq linkun
                  {ev.external_url && (
                    <>
                      {" "}
                      <a href={ev.external_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ember)" }}>
                        në faqen origjinale
                      </a>
                    </>
                  )}
                  {" "}ose na kontakto direkt.
                </p>
              ) : regOpen ? (
                <RegisterForm slug={ev.slug} eventStartIso={ev.start_at} />
              ) : (
                <p style={{ color: "var(--ink-2)", maxWidth: 720, lineHeight: 1.65 }}>
                  {eventStarted
                    ? `Kjo garë u zhvillua më ${formatDate(ev.start_at)}. Rezultatet ende nuk janë publikuar — kthehu më vonë.`
                    : closeAt && closeAt < now
                      ? `Regjistrimi për këtë garë është mbyllur më ${formatDate(closeAt.toISOString())}.`
                      : openAt && openAt > now
                        ? `Regjistrimi hapet më ${formatDate(openAt.toISOString())}.`
                        : "Regjistrimi nuk është i hapur për këtë garë."}
                </p>
              )}
            </div>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}

function ResultsBlock({
  results, eventStartIso,
}: { results: PublicResultRow[]; eventStartIso: string }) {
  const labelByValue = new Map<string, string>();
  for (const c of CATEGORIES) labelByValue.set(c.v, c.label);

  // Group by category (preset order first, unknowns next, "no category" last).
  const byCat = new Map<string, PublicResultRow[]>();
  for (const r of results) {
    const key = r.category ?? "_none";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }
  const orderedKeys: string[] = [];
  for (const c of CATEGORIES) if (byCat.has(c.v)) orderedKeys.push(c.v);
  for (const k of byCat.keys()) {
    if (k === "_none") continue;
    if (!labelByValue.has(k) && !orderedKeys.includes(k)) orderedKeys.push(k);
  }
  if (byCat.has("_none")) orderedKeys.push("_none");

  // Within each category: ranked riders first (by place asc), then unranked
  // (DNF/DNS) at the end.
  for (const list of byCat.values()) {
    list.sort((a, b) => {
      const ap = a.result_place ?? 9999;
      const bp = b.result_place ?? 9999;
      if (ap !== bp) return ap - bp;
      return (a.bib_number ?? 99999) - (b.bib_number ?? 99999);
    });
  }

  const PODIUM_LABELS = ["1", "2", "3"];

  return (
    <section style={{ marginTop: 72, paddingBottom: 72 }}>
      <div className="container" style={{ maxWidth: 1024 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          <span>Rezultatet zyrtare</span>
        </div>
        <h2 className="display display-m" style={{ marginTop: 0, marginBottom: 12 }}>
          Si përfundoi gara
        </h2>
        <p className="mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 32 }}>
          E zhvilluar më {new Date(eventStartIso).toLocaleDateString("sq-AL", { day: "2-digit", month: "long", year: "numeric" })}
        </p>

        {results.length === 0 ? (
          <p style={{ color: "var(--ink-2)" }}>
            Rezultatet janë publikuar por ende nuk ka të dhëna për t&apos;u shfaqur.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 40 }}>
            {orderedKeys.map((key) => {
              const list = byCat.get(key)!;
              const label = key === "_none" ? "Pa kategori" : labelByValue.get(key) ?? key;
              const podium = list.filter((r) => r.result_place != null && r.result_place <= 3);
              return (
                <section key={key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 16,
                      paddingBottom: 10,
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <h3
                      className="display"
                      style={{ fontSize: 24, letterSpacing: "-0.015em", margin: 0 }}
                    >
                      {label}
                    </h3>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".12em" }}>
                      {list.length} pjesëmarrës{list.length === 1 ? "" : "ë"}
                    </span>
                  </div>

                  {/* Podium chips when we have ranked top-3 */}
                  {podium.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${podium.length}, 1fr)`,
                        gap: 12,
                        marginBottom: 18,
                      }}
                    >
                      {podium.map((p) => (
                        <div
                          key={p.full_name + p.result_place}
                          style={{
                            background: "var(--ink)",
                            color: "var(--paper)",
                            borderRadius: 12,
                            padding: "16px 18px",
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            gap: 14,
                            alignItems: "center",
                          }}
                        >
                          <div
                            className="display"
                            style={{
                              fontSize: 36,
                              lineHeight: 1,
                              color: "var(--ember)",
                              minWidth: 28,
                              textAlign: "center",
                            }}
                          >
                            {PODIUM_LABELS[(p.result_place ?? 1) - 1]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{p.full_name}</div>
                            <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                              {p.club ?? "—"}
                              {p.result_time && <> · {p.result_time}</>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "2px solid var(--ink)" }}>
                          <ResultsTh>Vendi</ResultsTh>
                          <ResultsTh>Bib</ResultsTh>
                          <ResultsTh>Emri</ResultsTh>
                          <ResultsTh>Klubi</ResultsTh>
                          <ResultsTh>Koha</ResultsTh>
                          <ResultsTh>Shënim</ResultsTh>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r, i) => {
                          const placeLabel = r.result_place != null ? r.result_place : "—";
                          return (
                            <tr
                              key={`${r.full_name}-${i}`}
                              style={{
                                borderBottom: "1px solid var(--line)",
                                background: r.result_place == null
                                  ? "color-mix(in oklab, var(--ink) 3%, transparent)"
                                  : undefined,
                              }}
                            >
                              <td className="mono" style={{ padding: "10px 8px", fontWeight: 700, width: 60 }}>
                                {placeLabel}
                              </td>
                              <td className="mono" style={{ padding: "10px 8px", color: "var(--ink-3)", width: 60 }}>
                                {r.bib_number ?? "—"}
                              </td>
                              <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                                {r.full_name}
                                {r.gender && (
                                  <span
                                    className="mono"
                                    style={{
                                      marginLeft: 6, fontSize: 10, color: "var(--ink-3)", letterSpacing: ".12em",
                                    }}
                                  >
                                    {r.gender === "m" ? "M" : r.gender === "f" ? "F" : "•"}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "10px 8px", color: "var(--ink-2)" }}>{r.club ?? "—"}</td>
                              <td className="mono" style={{ padding: "10px 8px" }}>{r.result_time ?? "—"}</td>
                              <td style={{ padding: "10px 8px", color: "var(--ink-3)", fontSize: 12 }}>
                                {r.result_notes ?? ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ResultsTh({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="mono"
      style={{
        padding: "10px 8px",
        fontSize: 10,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}
