import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seksionet",
  description: "Gjashtë disiplina aktive: Rrugë, MTB, Gravel, Trek, Akademia e të rinjve, Femra.",
  alternates: { canonical: "/sections" },
};

export default async function SectionsPage() {
  const body = await getLegacyBody("sections.html");
  return (
    <>
      <PublicNav />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <FbPhotoStrip limit={8} />
      <Footer />
    </>
  );
}
