import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { NewsCard } from "@/components/ui/NewsCard";
import { getNewsPage } from "@/lib/supabase/fb";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Lajme",
  description: "Postimet më të reja nga klubi KÇ Prishtina 038.",
  alternates: { canonical: "/news" },
};

type SearchParams = Promise<{ page?: string }>;

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations();
  const sp = await searchParams;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const { rows, total } = await getNewsPage({ offset, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow={t("news.eyebrow")}
        title={t("news.pageTitle")}
        subtitle={t("news.pageLede")}
        pickerKey="news"
      />

      {/* Feed grid */}
      <section style={{ paddingTop: 48 }}>
        <div className="container">
          {rows.length === 0 ? (
            <p style={{ color: "var(--ink-2)", fontSize: 16 }}>{t("news.empty")}</p>
          ) : (
            <div className="news-grid">
              {rows.map((n, i) => (
                // First 3 cards above the fold → priority load
                <NewsCard key={n.slug} news={n} priority={i < 3} />
              ))}
            </div>
          )}

          {/* Pager */}
          {totalPages > 1 && (
            <nav
              className="mono"
              aria-label="News pagination"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 64,
                paddingTop: 32,
                borderTop: "1px solid rgba(15, 26, 46, 0.08)",
                fontSize: 12,
                letterSpacing: ".14em",
                textTransform: "uppercase",
              }}
            >
              {pageNum > 1 ? (
                <Link
                  href={(pageNum === 2 ? "/news" : `/news?page=${pageNum - 1}`) as never}
                  className="btn btn-ghost btn-sm"
                >
                  {t("news.newer")}
                </Link>
              ) : (
                <span />
              )}
              <span style={{ color: "var(--ink-2)" }}>
                {pageNum} / {totalPages} · {total} {total === 1 ? "post" : "posts"}
              </span>
              {pageNum < totalPages ? (
                <Link
                  href={(`/news?page=${pageNum + 1}`) as never}
                  className="btn btn-ghost btn-sm"
                >
                  {t("news.older")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </section>

      <div style={{ paddingBottom: 80 }} />

      <Footer />
    </>
  );
}
