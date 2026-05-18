import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import {
  getDocumentsGrouped, categoryLabel, documentUrl, formatBytes,
  CATEGORY_ORDER, type DocumentRow,
} from "@/lib/supabase/documents";

export const metadata: Metadata = {
  title: "Dokumentet",
  description: "Statuti, vendimet, procesverbalet dhe deklaratat e KÇ Prishtina 038.",
  alternates: { canonical: "/documents" },
};

export default async function DocumentsPage() {
  const grouped = await getDocumentsGrouped();
  const total = Array.from(grouped.values()).reduce((n, arr) => n + arr.length, 0);

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow="Dokumentet"
        title="Dokumentet zyrtare të klubit."
        subtitle={`Statuti, vendimet e bordit, procesverbalet, deklaratat dhe vërtetimet. ${total} dokumente në ${Array.from(grouped.values()).filter(a => a.length > 0).length} kategori.`}
        imageStoragePath={null}
      />

      <div style={{ height: 32 }} />

      {total === 0 && (
        <section>
          <div className="container">
            <p style={{ color: "var(--ink-2)", fontSize: 16 }}>
              Ende nuk ka dokumente të ngarkuara.
            </p>
          </div>
        </section>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) return null;
        return <DocumentCategorySection key={cat} category={cat} items={items} />;
      })}

      <Footer />
    </>
  );
}

function DocumentCategorySection({
  category, items,
}: {
  category: Parameters<typeof categoryLabel>[0];
  items: DocumentRow[];
}) {
  return (
    <section style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="container">
        <div className="docs-section-head">
          <div className="eyebrow"><span>{categoryLabel(category)}</span></div>
          <h2 className="display display-m" style={{ marginTop: 10 }}>
            {items.length} {items.length === 1 ? "dokument" : "dokumente"}.
          </h2>
        </div>
        <ul className="docs-list">
          {items.map((d) => (
            <li key={d.id} className="docs-item">
              <a
                href={documentUrl(d)}
                target="_blank"
                rel="noopener noreferrer"
                className="docs-item__inner"
              >
                <span className="docs-icon" aria-hidden="true">
                  <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
                    <path d="M3 1 H14 L21 8 V25 H3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
                    <path d="M14 1 V8 H21" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
                    <text x="11" y="20" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6" fill="currentColor">PDF</text>
                  </svg>
                </span>
                <span className="docs-item__body">
                  <span className="docs-item__title">{d.title}</span>
                  <span className="docs-item__meta mono">
                    {d.effective_date && <span>{new Date(d.effective_date).toLocaleDateString("sq", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>}
                    {d.byte_size && <span>{formatBytes(d.byte_size)}</span>}
                    {d.page_count && <span>{d.page_count} f.</span>}
                  </span>
                  {d.description && (
                    <span className="docs-item__desc">{d.description}</span>
                  )}
                </span>
                <span className="docs-item__cta mono" aria-hidden="true">
                  Hape
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
