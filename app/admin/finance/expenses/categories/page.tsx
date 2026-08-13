import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { CategoryCard, NewCategoryCard, type CategoryView } from "./CategoryCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Kategoritë e shpenzimeve" };

type CategoryRow = {
  id: string; code: string; name_sq: string; description_sq: string | null;
  display_order: number; active: boolean;
};

export default async function ExpenseCategoriesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Recording an expense is admin + staff; deciding the list of categories is
  // the owner's call alone — a rename or a retirement moves every report that
  // groups by it.
  if (profile.role !== "admin") redirect("/admin/finance/expenses");

  const supabase = await createClient();
  const [categoriesRes, usageRes] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, code, name_sq, description_sq, display_order, active")
      .order("display_order", { ascending: true }),
    // Which categories are actually in use — a used one is retired, not deleted.
    supabase.from("club_expenses").select("category_id").limit(5000),
  ]);

  if (categoriesRes.error) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Kategoritë e shpenzimeve</h1>
            <div className="sub">Lista e llojeve të shpenzimeve që përdor klubi.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(categoriesRes.error, "Leximi i kategorive dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Nëse kjo përsëritet, ka gjasa që skema e shpenzimeve nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const rows = (categoriesRes.data as unknown as CategoryRow[] | null) ?? [];
  const usage = (usageRes.data as unknown as { category_id: string }[] | null) ?? [];
  const countByCategory = new Map<string, number>();
  for (const u of usage) countByCategory.set(u.category_id, (countByCategory.get(u.category_id) ?? 0) + 1);

  const categories: CategoryView[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    name_sq: c.name_sq,
    description_sq: c.description_sq,
    display_order: c.display_order,
    active: c.active,
    expense_count: countByCategory.get(c.id) ?? 0,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kategoritë e shpenzimeve</h1>
          <div className="sub">
            Llojet e shpenzimeve që përdor klubi.{" "}
            <Link href="/admin/finance/expenses">Kthehu te shpenzimet</Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          Emri mund të ndryshohet lirisht — shpenzimet e vjetra e ndjekin emrin e ri, sepse lidhen me
          kategorinë, jo me tekstin.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          Një kategori që tashmë përdoret nuk fshihet: <strong>çaktivizoje</strong>, që të mos dalë më
          te shpenzimet e reja pa i lënë të vjetrat pa klasifikim.
        </p>
      </div>

      <div className="card-grid">
        {categories.map((c) => <CategoryCard key={c.id} category={c} />)}
        <NewCategoryCard />
      </div>
    </>
  );
}
