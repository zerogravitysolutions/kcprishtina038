import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { NewsCard } from "@/components/ui/NewsCard";
import { getRacesPage } from "@/lib/supabase/fb";

export const metadata: Metadata = {
  title: "Garat",
  description: "Garat ku KÇ Prishtina 038 ka marrë pjesë — kronologjia e plotë.",
  alternates: { canonical: "/races" },
};

const PAGE_SIZE = 60;

type SearchParams = Promise<{ page?: string; year?: string }>;

export default async function RacesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const { rows, total } = await getRacesPage({ offset, limit: PAGE_SIZE });

  // Group by year for visual hierarchy.
  const yearFilter = (sp.year ?? "").trim();
  const filtered = yearFilter
    ? rows.filter((r) => (r.published_at ?? "").startsWith(yearFilter))
    : rows;
  const years = Array.from(new Set(
    rows.map((r) => (r.published_at ?? "").slice(0, 4)).filter(Boolean)
  )).sort().reverse();
  const grouped = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const y = (r.published_at ?? "").slice(0, 4) || "—";
    if (!grouped.has(y)) grouped.set(y, []);
    grouped.get(y)!.push(r);
  }
  const orderedYears = Array.from(grouped.keys()).sort().reverse();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PublicNav />

      <section style={{ paddingTop: 96, paddingBottom: 32 }}>
        <div className="container">
          <div className="eyebrow"><span>Garat</span></div>
          <h1
            className="display"
            style={{
              marginTop: 16,
              fontSize: "clamp(40px, 6vw, 72px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.02,
              maxWidth: "16ch",
            }}
          >
            Kronologjia e garave.
          </h1>
          <p className="lede" style={{ marginTop: 24, maxWidth: "60ch", color: "var(--ink-2)" }}>
            {total} ngjarje të identifikuara nga publikimet tona në Facebook — Granfondo, Tour of Kosova, Kampionatet kombëtare, Sharr Cup dhe gara të tjera.
          </p>

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
                  className="races-year-band mono"
                  style={{
                    display: "flex", alignItems: "baseline", gap: 12,
                    marginBottom: 16,
                    fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
                    color: "var(--ink-3)",
                  }}
                >
                  <span style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(32px, 4vw, 56px)",
                    fontWeight: 700, letterSpacing: "-0.02em",
                    color: "var(--ink)",
                  }}>{y}</span>
                  <span style={{ borderTop: "1px solid color-mix(in oklab, var(--ink) 18%, transparent)", flex: 1, height: 1 }} />
                  <span>{grouped.get(y)!.length} gar{grouped.get(y)!.length === 1 ? "ë" : "a"}</span>
                </div>
                <div className="news-grid">
                  {grouped.get(y)!.map((n) => (
                    <NewsCard key={n.slug} news={n} />
                  ))}
                </div>
              </div>
            ))
          )}

          {totalPages > 1 && !yearFilter && (
            <nav
              className="mono"
              aria-label="Race pagination"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 32,
                paddingTop: 32,
                borderTop: "1px solid rgba(15, 26, 46, 0.08)",
                fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase",
              }}
            >
              {pageNum > 1 ? (
                <Link
                  href={(pageNum === 2 ? "/races" : `/races?page=${pageNum - 1}`) as never}
                  className="btn btn-ghost btn-sm"
                >
                  ← Më të reja
                </Link>
              ) : <span />}
              <span style={{ color: "var(--ink-2)" }}>
                {pageNum} / {totalPages} · {total}
              </span>
              {pageNum < totalPages ? (
                <Link
                  href={(`/races?page=${pageNum + 1}`) as never}
                  className="btn btn-ghost btn-sm"
                >
                  Më të vjetra →
                </Link>
              ) : <span />}
            </nav>
          )}
        </div>
      </section>

      <div style={{ paddingBottom: 80 }} />
      <Footer />
    </>
  );
}
