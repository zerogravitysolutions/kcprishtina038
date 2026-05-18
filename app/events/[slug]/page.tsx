import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Countdown } from "@/components/landing/Countdown";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/supabase/fb";
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
  cover: { storage_path: string } | null;
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
  "cover:media!cover_media_id(storage_path)";

function stravaEmbedSrc(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/strava\.com\/(routes|activities)\/(\d+)/i);
  if (!m) return null;
  return `https://www.strava.com/${m[1]}/${m[2]}/embed`;
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
  const sponsors = await getEventSponsors(ev.id);

  const coverUrl = mediaUrl(ev.cover?.storage_path ?? null);
  const stravaSrc = stravaEmbedSrc(ev.strava_url);
  const now = new Date();
  const closeAt = ev.registration_close_at ? new Date(ev.registration_close_at) : null;
  const openAt = ev.registration_open_at ? new Date(ev.registration_open_at) : null;
  const regOpen = (!openAt || openAt <= now) && (!closeAt || closeAt >= now);
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

        {/* Strava route / activity */}
        {(stravaSrc || ev.strava_url) && (
          <div className="container" style={{ maxWidth: 1024, marginTop: 56 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              <span>Rruga (Strava)</span>
            </div>
            {stravaSrc ? (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--line)",
                  background: "var(--paper-2)",
                  aspectRatio: "16 / 9",
                }}
              >
                <iframe
                  src={stravaSrc}
                  title={`Strava — ${ev.title_sq}`}
                  loading="lazy"
                  allowTransparency
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                  }}
                />
              </div>
            ) : null}
            {ev.strava_url && (
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
            )}
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

        {/* Registration */}
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
                {closeAt && closeAt < now
                  ? `Regjistrimi për këtë garë është mbyllur më ${formatDate(closeAt.toISOString())}.`
                  : openAt && openAt > now
                    ? `Regjistrimi hapet më ${formatDate(openAt.toISOString())}.`
                    : "Regjistrimi nuk është i hapur për këtë garë."}
              </p>
            )}
          </div>
        </section>
      </article>

      <Footer />
    </>
  );
}
