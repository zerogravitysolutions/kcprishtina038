import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { ArkaView } from "./ArkaView";
import { AnetaresiaView } from "./AnetaresiaView";
import { BorxhetView } from "./BorxhetView";
import { FINANCE_ROLES, overviewHref, type OverviewView } from "./data";
import { ALL } from "../filters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Pasqyra financiare" };

/**
 * The club's financial position across four focused views.
 *
 * This page is the merge of "Arka e klubit" and "Raportet financiare". Those
 * two printed the same open-member-debt euros, the same monthly billed total
 * and the same collection rate off differently capped queries, each promising
 * in its own words that it agreed with the other. Here every such figure is
 * computed once (see ./data.ts) and each view runs ONLY its own selects — the
 * cost of opening the Arka view is exactly what /admin/finance/treasury cost.
 *
 * The tab strip is what keeps the merge honest: ~12 sections on one scroll
 * would have been worse than the two pages it replaces.
 */
type SearchParams = Promise<{ v?: string; y?: string; p?: string }>;

const VIEWS: Array<{ id: OverviewView; label: string }> = [
  { id: "arka", label: "Arka" },
  { id: "anetaresia", label: "Akademia" },
  { id: "borxhet", label: "Borxhet" },
  { id: "historiku", label: "Historiku" },
];

export default async function FinanceOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const view: OverviewView = sp.v === "anetaresia" || sp.v === "borxhet" || sp.v === "historiku" ? sp.v : "arka";
  // Old bookmarks for the former all-years chip now open the history tab.
  if (view === "arka" && sp.y === ALL) redirect(overviewHref("historiku", { p: sp.p }));
  const navWindow = { y: sp.y === ALL ? undefined : sp.y, p: sp.p };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pasqyra financiare</h1>
          <div className="sub">
            {view === "arka" ? (
              "Bilanci dhe shpenzimet për vitin e zgjedhur."
            ) : view === "anetaresia" ? (
              "Pagesat dhe faturimi i anëtarësive sipas muajit."
            ) : view === "historiku" ? (
              "Bilanci që nga fillimi dhe krahasimi i viteve e burimeve."
            ) : (
              "Detyrimet e hapura të anëtarëve dhe të klubit."
            )}
          </div>
        </div>
      </div>

      <nav className="overview-tabs" aria-label="Pamjet e pasqyrës">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            className={`overview-tab ${view === v.id ? "active" : ""}`}
            href={overviewHref(v.id, navWindow)}
            aria-current={view === v.id ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "arka" ? <ArkaView y={sp.y} p={sp.p} /> : null}
      {view === "historiku" ? <ArkaView p={sp.p} history /> : null}
      {view === "anetaresia" ? <AnetaresiaView p={sp.p} y={sp.y} canEditPlans={profile.role === "admin"} /> : null}
      {view === "borxhet" ? <BorxhetView /> : null}
    </>
  );
}
