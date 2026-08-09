import { getTranslations } from "next-intl/server";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { JoinForm, type JoinPlanOption } from "./JoinForm";
import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bashkohu",
  description: "Apliko si anëtar i KÇ Prishtina 038. Pranojmë çiklistë të të gjitha niveleve nga 9 vjeç e lart.",
  alternates: { canonical: "/join" },
};

// The academy tiers shown on the form. Read live (not cached) so a price the
// owner edits in the admin panel is visible on the public page immediately.
// Returns [] when the table is unreachable — the form then simply omits the
// picker instead of blocking applications.
async function getPlanOptions(): Promise<JoinPlanOption[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("membership_plans")
    .select("id, code, name_sq, description_sq, amount_eur, billable")
    .eq("active", true)
    .order("display_order");
  return (data as JoinPlanOption[] | null) ?? [];
}

export default async function JoinPage() {
  const t = await getTranslations();
  const plans = await getPlanOptions();

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
            <JoinForm plans={plans} />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
