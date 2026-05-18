import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/supabase/fb";

export const metadata: Metadata = {
  title: "Eventet",
  description: "Eventet e ardhshme dhe ato të kaluara të organizuara nga KÇ Prishtina 038.",
  alternates: { canonical: "/events" },
};

type Row = {
  id: string;
  slug: string | null;
  title_sq: string;
  start_at: string;
  location: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  type: string;
  results_published: boolean;
  cover: { storage_path: string } | null;
};

const SELECT =
  "id, slug, title_sq, start_at, location, distance_km, elevation_m, type, results_published, " +
  "cover:media!cover_media_id(storage_path)";

export const dynamic = "force-dynamic";

export default async function EventsIndexPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [upcomingRes, pastRes] = await Promise.all([
    supabase.from("events")
      .select(SELECT)
      .eq("status", "published")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(24),
    supabase.from("events")
      .select(SELECT)
      .eq("status", "published")
      .lt("start_at", nowIso)
      .order("start_at", { ascending: false })
      .limit(48),
  ]);

  const upcoming = (upcomingRes.data as unknown as Row[] | null) ?? [];
  const past     = (pastRes.data     as unknown as Row[] | null) ?? [];

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow="Eventet"
        title="Kalendari i klubit."
        subtitle={`${upcoming.length} të ardhshme · ${past.length} të kaluara`}
        pickerKey="events"
      />

      <section style={{ paddingTop: 48, paddingBottom: 32 }}>
        <div className="container">
          <SectionHeading label="Të ardhshme" count={upcoming.length} />
          {upcoming.length === 0 ? (
            <p style={{ color: "var(--ink-3)", marginTop: 16 }}>
              Asnjë event i ardhshëm aktualisht. Kontrollo më vonë ose ndiq na në Facebook.
            </p>
          ) : (
            <div className="event-card-grid">
              {upcoming.map((r) => <EventCard key={r.id} row={r} />)}
            </div>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section style={{ paddingTop: 32, paddingBottom: 80, background: "var(--paper-2)" }}>
          <div className="container">
            <SectionHeading label="Të kaluara" count={past.length} />
            <div className="event-card-grid">
              {past.map((r) => <EventCard key={r.id} row={r} past />)}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 28,
      }}
    >
      <h2
        className="display"
        style={{ fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.015em", margin: 0 }}
      >
        {label}
      </h2>
      <span
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: ".16em",
          color: "var(--ink-3)",
          textTransform: "uppercase",
        }}
      >
        {count} event{count === 1 ? "" : "e"}
      </span>
    </div>
  );
}

function EventCard({ row: r, past }: { row: Row; past?: boolean }) {
  const cover = mediaUrl(r.cover?.storage_path ?? null);
  const d = new Date(r.start_at);
  const dd = d.toLocaleDateString("sq-AL", { day: "2-digit", month: "long", year: "numeric" });
  const tt = d.toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" });
  const sub = [
    r.location,
    r.distance_km ? `${r.distance_km} km` : null,
    r.elevation_m ? `${r.elevation_m} m` : null,
  ].filter(Boolean).join(" · ");
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    r.slug ? (
      <Link href={`/events/${r.slug}` as never} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
        {children}
      </Link>
    ) : (
      <div style={{ height: "100%" }}>{children}</div>
    );

  return (
    <Wrap>
      <article
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          transition: "transform .25s, box-shadow .25s",
          opacity: past && !r.results_published ? 0.94 : 1,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            background: "var(--paper-2)",
          }}
        >
          {cover ? (
            <Image
              src={cover}
              alt={r.title_sq}
              fill
              sizes="(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 33vw"
              quality={80}
              style={{ objectFit: "cover", filter: past ? "grayscale(25%)" : undefined }}
            />
          ) : (
            <span
              className="mono"
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--ink-3)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase",
              }}
            >
              {r.type}
            </span>
          )}
          {r.results_published && (
            <span
              className="mono"
              style={{
                position: "absolute", top: 16, right: 16,
                background: "var(--ember)", color: "var(--paper)",
                fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                padding: "6px 12px", borderRadius: 999, fontWeight: 600,
              }}
            >
              Rezultatet
            </span>
          )}
        </div>
        <div
          style={{
            padding: "28px 32px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: 1,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 12,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: past ? "var(--ink-3)" : "var(--ember)",
            }}
          >
            {dd} · {tt}
          </div>
          <h3
            className="display"
            style={{
              fontSize: "clamp(22px, 2.2vw, 28px)",
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
              margin: 0,
            }}
          >
            {r.title_sq}
          </h3>
          {sub && (
            <div
              className="mono"
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                letterSpacing: ".04em",
                marginTop: 4,
              }}
            >
              {sub}
            </div>
          )}
        </div>
      </article>
    </Wrap>
  );
}
