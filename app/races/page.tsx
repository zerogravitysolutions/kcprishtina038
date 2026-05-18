import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { getRaceEvents, mediaUrl, raceTypeLabel, type RaceEvent } from "@/lib/supabase/fb";

export const metadata: Metadata = {
  title: "Garat",
  description: "Garat ku KÇ Prishtina 038 ka marrë pjesë — kronologjia e plotë.",
  alternates: { canonical: "/races" },
};

type SearchParams = Promise<{ year?: string }>;

export default async function RacesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const yearFilter = (sp.year ?? "").trim();

  const all = await getRaceEvents();
  const years = Array.from(new Set(all.map((r) => r.race_date.slice(0, 4)))).sort().reverse();

  const filtered = yearFilter ? all.filter((r) => r.race_date.startsWith(yearFilter)) : all;
  const grouped = new Map<string, RaceEvent[]>();
  for (const r of filtered) {
    const y = r.race_date.slice(0, 4);
    if (!grouped.has(y)) grouped.set(y, []);
    grouped.get(y)!.push(r);
  }
  const orderedYears = Array.from(grouped.keys()).sort().reverse();

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow="Garat"
        title="Kronologjia e garave."
        subtitle={`${all.length} ngjarje të katalogizuara — kampionate kombëtare, gara rrugore, MTB, dhe etapa ndërkombëtare.`}
        pickerKey="races"
      />

      <section style={{ paddingTop: 48, paddingBottom: 32 }}>
        <div className="container">
          {years.length > 1 && (
            <div
              className="mono"
              style={{
                marginTop: 32, display: "flex", flexWrap: "wrap", gap: 8,
                fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
              }}
            >
              <Link
                href="/races"
                className="races-year-chip"
                aria-current={!yearFilter ? "page" : undefined}
                data-active={!yearFilter}
              >
                Të gjitha
              </Link>
              {years.map((y) => (
                <Link
                  key={y}
                  href={`/races?year=${y}` as never}
                  className="races-year-chip"
                  data-active={yearFilter === y}
                  aria-current={yearFilter === y ? "page" : undefined}
                >
                  {y}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="container">
          {filtered.length === 0 ? (
            <p style={{ color: "var(--ink-2)" }}>Nuk u gjet asnjë garë për këtë periudhë.</p>
          ) : (
            orderedYears.map((y) => (
              <div key={y} style={{ marginBottom: 48 }}>
                <div
                  className="races-year-band"
                  style={{
                    display: "flex", alignItems: "baseline", gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <span style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(32px, 4vw, 56px)",
                    fontWeight: 700, letterSpacing: "-0.02em",
                    color: "var(--ink)",
                  }}>{y}</span>
                  <span style={{ borderTop: "1px solid color-mix(in oklab, var(--ink) 18%, transparent)", flex: 1, height: 1 }} />
                  <span className="mono" style={{
                    fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
                    color: "var(--ink-3)",
                  }}>
                    {grouped.get(y)!.length} gar{grouped.get(y)!.length === 1 ? "ë" : "a"}
                  </span>
                </div>
                <div className="race-grid">
                  {grouped.get(y)!.map((r) => <RaceCard key={r.id} race={r} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div style={{ paddingBottom: 80 }} />
      <Footer />
    </>
  );
}

function RaceCard({ race: r }: { race: RaceEvent }) {
  const cover = mediaUrl(r.cover?.storage_path ?? null);
  const dateLabel = new Date(r.race_date).toLocaleDateString("sq", {
    day: "2-digit", month: "long", year: "numeric",
  });
  return (
    <Link href={`/races/${r.slug}` as never} className="race-card" aria-label={r.name}>
      <div className="race-card__photo">
        {cover ? (
          <Image
            src={cover}
            alt={r.name}
            fill
            sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
            quality={70}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="race-card__placeholder" aria-hidden="true">
            {r.race_type === "mtb" ? "MTB" : r.race_type === "stage" ? "TOUR" : "GARË"}
          </span>
        )}
      </div>
      <div className="race-card__body">
        <span className="race-card__date mono">{dateLabel}</span>
        <h3 className="race-card__name">{r.name}</h3>
        <div className="race-card__meta mono">
          {r.location && <span>{r.location}</span>}
          {r.race_type && <span>{raceTypeLabel(r.race_type)}</span>}
        </div>
      </div>
    </Link>
  );
}
