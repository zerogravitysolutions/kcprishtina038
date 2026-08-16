import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { ArkaView } from "./ArkaView";
import { AnetaresiaView } from "./AnetaresiaView";
import { BorxhetView } from "./BorxhetView";
import { FINANCE_ROLES, overviewHref, type OverviewView } from "./data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Pasqyra financiare" };

/**
 * The club's whole financial position, in one nav line and three views.
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
  { id: "arka", label: "Arka e klubit" },
  { id: "anetaresia", label: "Të hyrat e akademisë" },
  { id: "borxhet", label: "Borxhet" },
];

export default async function FinanceOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const view: OverviewView =
    sp.v === "anetaresia" ? "anetaresia" : sp.v === "borxhet" ? "borxhet" : "arka";

  /**
   * The year, forwarded to the sibling ledgers only when it was CHOSEN.
   *
   * A screen with no ?y= opens on the newest year IT has rows in, and says so
   * in its heading — that is the panel's default and each screen resolves it
   * against its own data. So a bare link stays bare and lets the destination
   * pick. But a year the user picked here is a decision, and dropping it on the
   * way out would silently undo it. This page cannot resolve the Arka default
   * itself without repeating that view's three reads, which is exactly why only
   * the explicit case travels.
   */
  const carriedYear = (sp.y ?? "").trim();
  const yq = carriedYear ? `?y=${encodeURIComponent(carriedYear)}` : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pasqyra financiare</h1>
          <div className="sub">
            {view === "arka" ? (
              <>
                Hyrjet, daljet dhe bilanci i klubit.{" "}
                <Link href={`/admin/finance/funds${yq}`}>Hyrjet e klubit</Link>
                {" · "}<Link href={`/admin/finance/expenses${yq}`}>Shpenzimet</Link>
                {" · "}<Link href="/admin/finance">Faturat e anëtarëve</Link>
              </>
            ) : view === "anetaresia" ? (
              <>
                Sa para hyjnë, sa faturohet, sa pritet të vijë çdo muaj dhe sa ka mbetur pa u arkëtuar.
                Të gjitha shumat llogariten vetëm mbi anëtarësitë me pagesë — garuesit nuk faturohen
                dhe nuk hyjnë as te të hyrat, as te borxhi, as te norma e arkëtimit.{" "}
                <Link href="/admin/finance">Faturat e anëtarëve</Link>
                {profile.role === "admin" ? <>{" · "}<Link href="/admin/plans">Planet</Link></> : null}
              </>
            ) : (
              <>
                Çka i kanë borxh anëtarët klubit dhe çka u ka borxh klubi njerëzve.{" "}
                <Link href="/admin/finance">Faturat e anëtarëve</Link>
                {" · "}<Link href="/admin/finance/expenses">Shpenzimet</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <nav className="filter-bar" aria-label="Pamjet e pasqyrës">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            className={`chip ${view === v.id ? "active" : ""}`}
            href={overviewHref(v.id, sp)}
            aria-current={view === v.id ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "arka" ? <ArkaView y={sp.y} p={sp.p} /> : null}
      {view === "anetaresia" ? <AnetaresiaView p={sp.p} y={sp.y} canEditPlans={profile.role === "admin"} /> : null}
      {view === "borxhet" ? <BorxhetView /> : null}
    </>
  );
}
