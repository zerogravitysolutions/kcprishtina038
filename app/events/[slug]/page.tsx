import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
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
  source: string | null;
  cover: { storage_path: string } | null;
};

const EVENT_SELECT =
  "id, slug, title_sq, title_en, type, status, start_at, end_at, location, " +
  "distance_km, elevation_m, description_sq, description_en, " +
  "registration_open_at, registration_close_at, external_url, source, " +
  "cover:media!cover_media_id(storage_path)";

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

  const coverUrl = mediaUrl(ev.cover?.storage_path ?? null);
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
              <RegisterForm slug={ev.slug} />
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
