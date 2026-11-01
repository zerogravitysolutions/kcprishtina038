import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Çiklizëm malor · MTB",
  description: "Zbulo çiklizmin malor me KÇ Prishtina 038: stërvitje në shtigje, teknikë në terren dhe gara cross-country.",
  alternates: { canonical: "/sections/mtb" },
};

export default async function MtbPage() {
  const body = await getLegacyBody("section-mtb.html", { stripHero: true });
  return (
    <>
      <PublicNav />
      <PageHero
        eyebrow="Çiklizëm malor · MTB"
        title="Së bashku në shtigjet e Gërmisë"
        subtitle="Ngjitje, zbritje dhe kënaqësia e çiklizmit në natyrë. Zhvillojmë teknikën në terren dhe përgatitemi për gara cross-country e maratona malore."
        pickerKey="sections-mtb"
      />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <FbPhotoStrip limit={6} />
      <Footer />
    </>
  );
}
