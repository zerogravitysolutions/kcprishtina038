import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { DocsList } from "@/components/public/DocsList";
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
        subtitle={`Statuti, vendimet e bordit, procesverbalet, deklaratat dhe vërtetimet. ${total} ${total === 1 ? "dokument" : "dokumente"} në ${Array.from(grouped.values()).filter(a => a.length > 0).length} kategori.`}
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
          <h2 className="display display-m">{categoryLabel(category)}</h2>
          <div className="eyebrow" style={{ marginTop: 10 }}>
            <span>{items.length} {items.length === 1 ? "dokument" : "dokumente"}</span>
          </div>
        </div>
        <DocsList
          items={items.map((d) => ({
            id: d.id,
            title: d.title,
            url: documentUrl(d),
            date: d.effective_date ? new Date(d.effective_date).toLocaleDateString("sq", { day: "2-digit", month: "2-digit", year: "numeric" }) : null,
            size: d.byte_size ? formatBytes(d.byte_size) : null,
            pages: d.page_count,
            description: d.description,
          }))}
        />
      </div>
    </section>
  );
}
