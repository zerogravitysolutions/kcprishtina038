import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { PlanForm, type PlanView } from "./PlanForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Planet e anëtarësisë" };

// ADMIN ONLY, to match the nav.
//
// The sidebar row for "Planet e anëtarësisë" is allow: ["admin"], so a staff
// member never saw the row — but this gate used to let them in by typing the
// URL, which is a menu and a page disagreeing about who this screen is for.
// Nothing is lost by closing it: staff still get the money view of the tiers on
// the Pasqyra ("Sipas planit"), which is where a tier matters to them — how
// much each one bills, collects and is owed. What lives ONLY here is the
// catalogue editor, and membership_plans_write_admin already limited that to
// the admin.
//
// The write gate below is unchanged and stays a separate line on purpose: it
// mirrors the SQL policy, and the two must not be collapsed into one check.
const VIEW_ROLES = ["admin"];

type PlanRow = {
  id: string; code: string; name_sq: string; description_sq: string | null;
  amount_eur: number | null; billable: boolean; active: boolean; display_order: number;
};

export default async function PlansPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/admin/dashboard");
  const canWrite = profile.role === "admin";

  const supabase = await createClient();
  const [plansRes, membershipsRes] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("id, code, name_sq, description_sq, amount_eur, billable, active, display_order")
      .order("display_order", { ascending: true }),
    supabase.from("memberships").select("plan_id, status").eq("status", "active").limit(2000),
  ]);

  if (plansRes.error) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Planet e anëtarësisë</h1>
            <div className="sub">Tre planet e akademisë.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(plansRes.error, "Leximi i planeve dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Nëse kjo përsëritet, ka gjasa që skema e faturimit nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const planRows = (plansRes.data as unknown as PlanRow[] | null) ?? [];
  const memberships = (membershipsRes.data as unknown as { plan_id: string; status: string }[] | null) ?? [];

  const countByPlan = new Map<string, number>();
  for (const m of memberships) countByPlan.set(m.plan_id, (countByPlan.get(m.plan_id) ?? 0) + 1);

  const plans: PlanView[] = planRows.map((p) => ({
    id: p.id,
    code: p.code,
    name_sq: p.name_sq,
    description_sq: p.description_sq,
    amount_eur: p.amount_eur,
    billable: p.billable,
    active: p.active,
    active_members: countByPlan.get(p.id) ?? 0,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planet e anëtarësisë</h1>
          <div className="sub">
            Planet e akademisë që shfaqen në formularin e regjistrimit.{" "}
            <Link href="/admin/people">Njerëzit</Link>
            {" · "}<Link href="/admin/finance/overview?v=anetaresia">Sipas planit</Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          Ndryshimi i çmimit vlen vetëm për anëtarësitë e reja — faturat e lëshuara dhe anëtarësitë
          ekzistuese ruajnë çmimin me të cilin janë krijuar.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          Plani <strong>Garues</strong> është pa pagesë mujore: nuk faturohet dhe nuk i lëshohet asnjë faturë.
          {canWrite ? " Nëse e ndez faturimin për një plan, duhet t’i japësh edhe një çmim mujor." : ""}
        </p>
        {!canWrite ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-3)" }}>
            Vetëm admini mund t’i ndryshojë planet.
          </p>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-3)" }}>
            Nuk ka asnjë plan anëtarësie. Planet vijnë bashkë me skemën e faturimit — nëse mungojnë, ajo nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {plans.map((p) => <PlanForm key={p.id} plan={p} canWrite={canWrite} />)}
        </div>
      )}
    </>
  );
}
