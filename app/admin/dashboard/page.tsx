import Link from "next/link";
import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AppRow = { id: string; full_name: string; email: string; experience: string | null; created_at: string; section: { slug: string; name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }
function rel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "tani";
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + " min";
  if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + "h";
  return Math.floor(ms / 86_400_000) + "d";
}

const SOFT_SHADOW = "0 1px 2px rgba(15,26,46,0.04), 0 8px 24px rgba(15,26,46,0.05)";
const CARD: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 16, boxShadow: SOFT_SHADOW };
const AVATAR: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, flexShrink: 0,
  background: "color-mix(in oklab, var(--teal) 24%, #fff)", color: "var(--ink)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12.5,
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
        <Kpi accent="#6FAAA8" label="Anëtarë aktivë" value={membersC.count ?? 0} sub={`${membersC.count ?? 0} në bazë`} />
        <Kpi accent="#C25A2D" label="Aplikime në pritje" value={pendingApps} sub={pendingApps > 0 ? "kërkojnë shqyrtim" : "asnjë e re"} tone={pendingApps > 0 ? "warn" : undefined} />
        <Kpi accent="#2E8B57" label="Anëtarësi këtë muaj" value={`${paid}/${duesRows.length}`} sub={duesRows.length === 0 ? "pa pagesa" : `${duesRows.length - paid} pa paguar`} />
        <Kpi accent="#1B2742" label="Ngjarje të ardhshme" value={eventsC.count ?? 0} sub="të publikuara" />
      </div>

      {/* Applications */}
      <div style={{ ...CARD, marginTop: 24, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>Aplikimet e fundit</h3>
          <Link href="/admin/applications" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ember-deep)" }}>Shiko të gjitha →</Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <Th pl>Aplikanti</Th><Th>Seksioni</Th><Th>Përvoja</Th><Th>Pranuar</Th><Th pr />
              </tr>
            </thead>
            <tbody>
              {appList.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "26px 22px", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12.5, textAlign: "center" }}>Nuk ka aplikime në pritje ✦</td></tr>
              ) : appList.map(a => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "13px 22px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={AVATAR}>{initials(a.full_name)}</div>
                      <div style={{ lineHeight: 1.25 }}>
                        <div style={{ fontWeight: 600 }}>{a.full_name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".04em", color: "var(--ink-3)", marginTop: 2 }}>{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "13px 12px" }}>{a.section ? <span className={`tag-sec ${a.section.slug}`}>{a.section.name_sq}</span> : "—"}</td>
                  <td style={{ padding: "13px 12px", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-2)" }}>{a.experience ?? "—"}</td>
                  <td style={{ padding: "13px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>{rel(a.created_at)}</td>
                  <td style={{ padding: "13px 22px", textAlign: "right" }}>
                    <Link className="btn btn-sm btn-ember" href="/admin/applications">Shqyrto</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

function Th({ children, pl, pr }: { children?: React.ReactNode; pl?: boolean; pr?: boolean }) {
  return (
    <th style={{
      textAlign: "left", padding: `10px ${pr ? 22 : 12}px 10px ${pl ? 22 : 12}px`,
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
      color: "var(--ink-3)", fontWeight: 500, background: "var(--paper)",
    }}>{children}</th>
  );
}
