import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { JoinForm } from "./JoinForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bashkohu",
  description: "Apliko si anëtar i KÇ Prishtina 038. Pranojmë çiklistë të të gjitha niveleve nga 9 vjeç e lart.",
  alternates: { canonical: "/join" },
};

export default async function JoinPage() {
  const t = await getTranslations();

  return (
    <>
      <PublicNav />

      <PageHero
        eyebrow={t("join.eyebrow")}
        title={t("jp.title")}
        subtitle={t("jp.lede")}
        pickerKey="join"
      />

      <div style={{ height: 32 }} />

      <section id="form">
        <div className="container">
          <div className="form-card" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="eyebrow"><span>Formulari i aplikimit</span></div>
            <h2 className="display display-s" style={{ marginTop: 12 }}>Plotësoje formularin dhe ne të kontaktojmë.</h2>
            <JoinForm />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
