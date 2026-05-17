import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { getLegacyBody } from "@/lib/legacy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kalendari 2026",
  description: "Çdo garë dhe ride e sezonit 2026: Granfondo Sharri, Tour of Kosovo, Germi Open Ride, kampet verore.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage() {
  const body = await getLegacyBody("events.html");
  return (
    <>
      <PublicNav />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <Footer />
    </>
  );
}
