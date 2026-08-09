import Link from "next/link";
import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AppRow = { id: string; full_name: string; email: string; experience: string | null; created_at: string; section: { slug: string; name_sq: string } | null };

// Albanian display names for the stored experience values (values stay raw).
const EXP_LABEL: Record<string, string> = {
  beginner: "Fillestar",
  intermediate: "Mesatar",
  advanced: "I avancuar",
  racer: "Garues",
};

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }
function rel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "tani";
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + " min";
  if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + "h";
  return Math.floor(ms / 86_400_000) + "d";
}

const SOFT_SHADOW = "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)";
const CARD: React.CSSProperties = { background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: SOFT_SHADOW };
const AVATAR: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
  background: "color-mix(in oklab, var(--accent-2) 16%, #fff)", color: "var(--accent-2-hi)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12.5,
  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--accent-2) 22%, transparent)",
};

export default async function AdminDashboard() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Coaches don't use the dashboard — their home is the monthly progress.
  if (profile.role === "coach") redirect("/admin/training/progress");
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

  const [membersC, appsC, duesData, apps, eventsC] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("dues").select("status").gte("period", monthStart).lt("period", monthEnd),
    supabase.from("applications").select("id, full_name, email, experience, created_at, section:sections(slug, name_sq)").eq("status", "pending").order("created_at", { ascending: false }).limit(4),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "published").gte("start_at", nowIso),
  ]);

  const duesRows = (duesData.data as { status: string }[] | null) ?? [];
  const paid = duesRows.filter(d => d.status === "paid").length;
  const appList = (apps.data as AppRow[] | null) ?? [];
  const first = profile.full_name.split(" ")[0];
  const pendingApps = appsC.count ?? 0;

  return (
    <>
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 10 }}>
          {now.toLocaleDateString("sq", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 34, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05 }}>
          Përshëndetje, <span style={{ color: "var(--ember)", fontStyle: "italic", fontVariationSettings: "'wdth' 80" }}>{first}</span>.
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        <Kpi accent="#0E9384" label="Anëtarë aktivë" value={membersC.count ?? 0} sub={`${membersC.count ?? 0} në bazë`} />
        <Kpi accent="#E0562D" label="Aplikime në pritje" value={pendingApps} sub={pendingApps > 0 ? "kërkojnë shqyrtim" : "asnjë i ri"} tone={pendingApps > 0 ? "warn" : undefined} />
        <Kpi accent="#16A34A" label="Faturat këtë muaj" value={`${paid}/${duesRows.length}`} sub={duesRows.length === 0 ? "asnjë faturë e lëshuar" : `${duesRows.length - paid} të papaguara`} />
        <Kpi accent="#2E90FA" label="Evente të ardhshme" value={eventsC.count ?? 0} sub="të publikuara" />
      </div>

      {/* Applications — card row-list, no table */}
      <div style={{ ...CARD, marginTop: 24, overflow: "hidden", padding: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0, color: "var(--ink)" }}>Aplikimet e fundit</h3>
          <Link href="/admin/applications" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ember)" }}>Shiko të gjitha →</Link>
        </div>
        {appList.length === 0 ? (
          <div style={{ padding: "28px 22px", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12.5, textAlign: "center" }}>Nuk ka aplikime në pritje ✦</div>
        ) : appList.map((a, i) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 22px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
            <div style={AVATAR}>{initials(a.full_name)}</div>
            <div style={{ minWidth: 0, flex: "1 1 190px", lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>{a.full_name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".02em", color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</div>
            </div>
            {a.section ? <span className={`tag-sec ${a.section.slug}`}>{a.section.name_sq}</span> : null}
            {a.experience ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>{EXP_LABEL[a.experience] ?? a.experience}</span> : null}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{rel(a.created_at)}</span>
            <Link className="btn btn-sm btn-ember" href="/admin/applications">Shqyrto</Link>
          </div>
        ))}
      </div>
    </>
  );
}

function Kpi({ accent, label, value, sub, tone }: { accent: string; label: string; value: string | number; sub?: string; tone?: "warn" | "up" }) {
  return (
    <div style={{ ...CARD, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 38, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--ink)", fontFeatureSettings: "'tnum' 1" }}>{value}</div>
      {sub != null && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".02em", color: tone === "warn" ? "var(--ember-deep)" : tone === "up" ? "var(--ok)" : "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

