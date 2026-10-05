import Link from "next/link";

export function KpiTabs({ active }: { active: "overview" | "segments" }) {
  return (
    <nav aria-label="KPI-të e stërvitjes" className="filter-bar" style={{ marginBottom: 18 }}>
      <Link className={`chip ${active === "overview" ? "active" : ""}`} href="/admin/training/kpi">Përmbledhje</Link>
      <Link className={`chip ${active === "segments" ? "active" : ""}`} href="/admin/training/kpi/segments">Segmentet</Link>
    </nav>
  );
}
