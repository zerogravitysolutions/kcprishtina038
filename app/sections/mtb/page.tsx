import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { FbPhotoStrip } from "@/components/fb/FbPhotoStrip";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTB · Seksioni 02",
  description: "Cross-country mbi Germinë, Sharrin dhe Prokletijet. XCO dhe maratonë.",
  alternates: { canonical: "/sections/mtb" },
};

export default async function MtbPage() {
  const body = await getLegacyBody("section-mtb.html");
  return (
    <>
      <PublicNav />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <FbPhotoStrip limit={6} />
      <Footer />
    </>
  );
}
