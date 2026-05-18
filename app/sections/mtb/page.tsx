import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTB · Seksioni 02",
  description: "Cross-country mbi Germinë, Sharrin dhe Prokletijet. XCO dhe maratonë.",
  alternates: { canonical: "/sections/mtb" },
};

export default async function MtbPage() {
  const body = await getLegacyBody("section-mtb.html", { stripHero: true });
  return (
    <>
      <PublicNav />
      <PageHero
        eyebrow="Seksioni 02 · MTB"
        title="Cross-country mbi Germinë."
        subtitle="Disiplina më e madhe e klubit pas Rrugës. Stërvitemi në shtigjet e Germisë, Sharrit dhe Prokletijeve; garojmë në XCO të FÇK dhe në maratonat rajonale."
        pickerKey="sections-mtb"
      />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <FbPhotoStrip limit={6} />
      <Footer />
    </>
  );
}
