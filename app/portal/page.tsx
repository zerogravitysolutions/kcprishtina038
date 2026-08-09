import { createClient, getProfile } from "@/lib/supabase/server";
import { billingMode, effectiveStatus, formatEur, outstandingTotal } from "@/lib/finance";
import type { DuesStatus, MembershipStatus } from "@/lib/supabase/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NextReg = {
  status: string;
  category: { name: string } | null;
  event: { id: string; title_sq: string; start_at: string; location: string | null; distance_km: number | null; elevation_m: number | null } | null;
};

type DueRow = { amount_eur: number; status: DuesStatus; period: string; due_date: string | null };
type MembershipRow = { amount_eur: number; billable: boolean; status: MembershipStatus; start_date: string };

const REG_STATUS_LABELS: Record<string, string> = {
  registered: "Regjistruar",
  waitlist: "Listë pritjeje",
  cancelled: "Anuluar",
  checked_in: "Paraqitur",
  dnf: "DNF",
  dns: "DNS",
};

export default async function PortalDashboard() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const first = profile.full_name.split(/\s+/)[0] || "Anëtar";

  const nowIso = new Date().toISOString();

  const [{ data: nextRegs }, { data: duesRows }, { data: membershipRows }] = await Promise.all([
    supabase.from("event_registrations")
      .select("status, category:event_categories(name), event:events!inner(id, title_sq, start_at, location, distance_km, elevation_m)")
      .eq("member_id", profile.id)
      .gte("event.start_at", nowIso)
      .order("event(start_at)", { ascending: true })
      .limit(1),
    supabase.from("dues")
      .select("amount_eur, status, period, due_date")
      .eq("member_id", profile.id)
      .in("status", ["unpaid", "overdue"])
      .order("period", { ascending: true }),
    // Only to word the membership card: a racer owes nothing by design, and
    // "e paguar" would be the wrong sentence for someone never invoiced.
    supabase.from("memberships")
      .select("amount_eur, billable, status, start_date")
      .eq("member_id", profile.id)
      .order("start_date", { ascending: false })
      .limit(5),
  ]);

  const nextReg = (nextRegs as NextReg[] | null)?.[0] ?? null;
  const dues = (duesRows as DueRow[] | null) ?? [];
  const unpaidTotal = outstandingTotal(dues);
  const overdueCount = dues.filter((d) => effectiveStatus(d) === "overdue").length;
  const memberships = (membershipRows as MembershipRow[] | null) ?? [];
  const membership = memberships.find((m) => m.status === "active") ?? memberships[0] ?? null;
  const mode = membership ? billingMode(membership) : null;

  // One line, and it must agree with /portal/membership: no invoice open is not
  // the same claim as "paid", and a racer is outside billing altogether.
  const duesLine =
    unpaidTotal > 0
      ? `${dues.length === 1 ? "1 faturë e hapur" : `${dues.length} fatura të hapura`} · ${formatEur(unpaidTotal)}${overdueCount > 0 ? " · në vonesë" : ""}`
      : mode === "non_billable"
        ? "Garues · nuk faturohesh"
        : mode === "waived"
          ? "E falur · pa pagesë mujore"
          : !membership
            ? "Anëtarësia nuk është regjistruar ende"
            : "Asnjë faturë e hapur";

  let raceLine = "Ende nuk je regjistruar në asnjë garë — shfleto kalendarin për t’u regjistruar.";
  let daysLabel: string | null = null;
  if (nextReg?.event) {
    const ev = nextReg.event;
    const days = Math.max(0, Math.ceil((new Date(ev.start_at).getTime() - Date.now()) / 86_400_000));
    daysLabel = String(days).padStart(2, "0");
    const parts: string[] = [new Date(ev.start_at).toLocaleDateString("sq", { day: "2-digit", month: "short" }).toUpperCase()];
    if (ev.location) parts.push(ev.location);
    if (ev.distance_km) parts.push(`${ev.distance_km} km`);
    if (ev.elevation_m) parts.push(`${ev.elevation_m} m`);
    raceLine = parts.join(" · ");
  }

  return (
    <>
      <div className="portal-hero-head">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, letterSpacing: "-0.03em", margin: 0 }}>
            Mirë se erdhe, <em style={{ fontStyle: "italic", fontVariationSettings: "'wdth' 75", color: "var(--ember)" }}>{first}</em>.
          </h1>
          <div className="sub" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".06em", color: "var(--ink-3)" }}>
            {new Date().toLocaleDateString("sq", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn btn-ghost" style={{ padding: "10px 14px", fontSize: 13 }} href="/portal/membership">
            {unpaidTotal > 0 ? `Për të paguar · ${formatEur(unpaidTotal)}` : "Anëtarësia & faturat"}
          </Link>
          <Link className="btn btn-ember" style={{ padding: "10px 14px", fontSize: 13 }} href={"/races" as never}>Garat e klubit</Link>
        </div>
      </div>

      <div className="portal-duo">
        <div className="pcard" style={{ background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 16, padding: 24, boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>Gara jote e ardhshme</h2>
            {nextReg ? <span className="kicker" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ember)" }}>{REG_STATUS_LABELS[nextReg.status] ?? nextReg.status}</span> : null}
          </div>

          {nextReg?.event ? (
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "64px 1fr", gap: 16 }}>
              <div style={{ textAlign: "center", padding: "10px 0", background: "var(--ember)", color: "var(--paper)", borderRadius: 8 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: "-0.02em" }}>{daysLabel}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", marginTop: 4 }}>ditë</div>
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.015em", margin: 0 }}>
                  {nextReg.event.title_sq}
                </h3>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".06em", color: "var(--ink-3)", marginTop: 4 }}>
                  {raceLine}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-3)" }}>{raceLine}</p>
          )}
        </div>

        <div className="pcard dark" style={{ background: "var(--ink)", color: "var(--paper)", borderRadius: 16, padding: 24, boxShadow: "0 1px 2px rgba(15,26,46,.06), 0 10px 28px rgba(15,26,46,.10)" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0, color: "var(--paper)" }}>Anëtarësia</h2>
          <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate)" }}>
            {duesLine}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 20 }}>
            <Link href="/portal/membership" className="btn" style={{ background: "transparent", borderColor: "rgba(244,242,236,.3)", color: "var(--paper)" }}>
              Anëtarësia & faturat →
            </Link>
            <Link href="/portal/profile" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--slate)", textDecoration: "underline" }}>
              Profili & dokumentet
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
