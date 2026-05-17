import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klubi",
  description: "Tre themelues, një ide e qartë: ta vendosim Prishtinën në hartën çiklistike të Ballkanit.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const body = await getLegacyBody("about.html");
  return (
    <>
      <PublicNav />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <Footer />
    </>
  );
}
