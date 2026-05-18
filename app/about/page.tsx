import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { FbFollowBand } from "@/components/fb/FbFollowBand";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klubi",
  description: "Tre themelues, një ide e qartë: ta vendosim Prishtinën në hartën çiklistike të Ballkanit.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const body = await getLegacyBody("about.html", { stripHero: true });
  return (
    <>
      <PublicNav />
      <PageHero
        eyebrow="Klubi"
        title="Tre themelues. Një ide e qartë."
        subtitle="Të vendosim Prishtinën në hartën çiklistike të Ballkanit — me kalendar, akademinë e të rinjve dhe ekip që garon jashtë kufirit."
        pickerKey="about"
      />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <FbFollowBand />
      <Footer />
    </>
  );
}
