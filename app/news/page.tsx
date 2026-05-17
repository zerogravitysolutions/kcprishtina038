import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { getFbPostsPage, mediaUrl, postTitle, postBody, formatPostDate } from "@/lib/supabase/fb";

const PAGE_SIZE = 12;

export const metadata: Metadata = {
  title: "Lajme",
  description: "Postimet më të reja nga faqja jonë në Facebook — KÇ Prishtina 038.",
  alternates: { canonical: "/news" },
};

type SearchParams = Promise<{ page?: string }>;

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations();
  const sp = await searchParams;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const { rows, total } = await getFbPostsPage({ offset, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PublicNav />

      {/* Page hero */}
      <section style={{ paddingTop: 96, paddingBottom: 32 }}>
        <div className="container">
          <div className="eyebrow"><span>{t("news.eyebrow")}</span></div>
          <h1 className="display display-l" style={{ marginTop: 16 }}>
            {t("news.pageTitle")}
          </h1>
          <p className="lede" style={{ marginTop: 16, maxWidth: "60ch" }}>
            {t("news.pageLede")}
          </p>
        </div>
      </section>

      {/* Feed grid */}
      <section>
        <div className="container">
          {rows.length === 0 ? (
            <p style={{ color: "var(--ink-2)", fontSize: 16 }}>{t("news.empty")}</p>
          ) : (
            <div className="news-grid">
              {rows.map((p) => {
                const imgUrl = mediaUrl(p.cover?.storage_path ?? null);
                const title = postTitle(p);
                const body = postBody(p);
                const card = (
                  <>
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
                    <span className="date mono">
                      {formatPostDate(p.created_time)} · FACEBOOK
                    </span>
                    <h3>{title || "KÇ Prishtina 038"}</h3>
                    {body && (
                      <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>{body}</p>
                    )}
                    {p.permalink_url && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 11,
                          letterSpacing: ".14em",
                          textTransform: "uppercase",
                          color: "var(--ember)",
                          marginTop: 12,
                        }}
                      >
                        {t("news.viewOnFb")} →
                      </span>
                    )}
                  </>
                );
                return p.permalink_url ? (
                  <a
                    key={p.id}
                    href={p.permalink_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="news-card"
                    style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}
                  >
                    {card}
                  </a>
                ) : (
                  <article key={p.id} className="news-card">
                    {card}
                  </article>
                );
              })}
            </div>
          )}

          {/* Pager */}
          {totalPages > 1 && (
            <div
              className="mono"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 48,
                paddingTop: 24,
                borderTop: "1px solid var(--rule)",
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
            </div>
          )}
        </div>
      </section>

      <div style={{ paddingBottom: 64 }} />

      <Footer />
    </>
  );
}
