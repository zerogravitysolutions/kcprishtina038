import { createClient, getProfile } from "@/lib/supabase/server";
import Link from "next/link";

type NextReg = {
  status: string;
  category: { name: string } | null;
  event: { id: string; title_sq: string; start_at: string; location: string | null; distance_km: number | null; elevation_m: number | null } | null;
};

type DueRow = { amount_eur: number; status: string; period: string };

export default async function PortalDashboard() {
  const profile = (await getProfile())!;
  const supabase = await createClient();
  const first = profile.full_name.split(/\s+/)[0] || "Anëtar";

  const nowIso = new Date().toISOString();

  const [{ data: nextRegs }, { data: duesRows }] = await Promise.all([
    supabase.from("event_registrations")
      .select("status, category:event_categories(name), event:events!inner(id, title_sq, start_at, location, distance_km, elevation_m)")
      .eq("member_id", profile.id)
      .gte("event.start_at", nowIso)
      .order("event(start_at)", { ascending: true })
      .limit(1),
    supabase.from("dues")
      .select("amount_eur, status, period")
      .eq("member_id", profile.id)
      .in("status", ["unpaid", "overdue"])
      .order("period", { ascending: true }),
  ]);

  const nextReg = (nextRegs as NextReg[] | null)?.[0] ?? null;
  const dues = (duesRows as DueRow[] | null) ?? [];
  const unpaidTotal = dues.reduce((s, d) => s + Number(d.amount_eur), 0);

  let raceLine = "Asnjë garë e regjistruar — shfletoni kalendarin për të regjistruar.";
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, letterSpacing: "-0.03em", margin: 0 }}>
            Mirë se erdhe, <em style={{ fontStyle: "italic", fontVariationSettings: "'wdth' 75", color: "var(--ember)" }}>{first}</em>.
          </h1>
          <div className="sub" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".06em", color: "var(--ink-3)" }}>
            {new Date().toLocaleDateString("sq", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {unpaidTotal > 0 ? (
            <a className="btn btn-ghost" style={{ padding: "10px 14px", fontSize: 13 }} href="mailto:info@prishtina038.cc?subject=Pay%20dues">Pay dues · €{unpaidTotal.toFixed(2).replace(/\.00$/, "")}</a>
          ) : (
            <span className="btn btn-ghost" style={{ padding: "10px 14px", fontSize: 13, opacity: 0.6, pointerEvents: "none" }}>Dues paguar ✓</span>
          )}
          <Link className="btn btn-ember" style={{ padding: "10px 14px", fontSize: 13 }} href={"/races" as never}>Garat e klubit</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div className="pcard" style={{ background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>Gara jote e ardhshme</h2>
            {nextReg ? <span className="kicker" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ember)" }}>{nextReg.status}</span> : null}
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "64px 1fr", gap: 16 }}>
            <div style={{ textAlign: "center", padding: "10px 0", background: nextReg ? "var(--ember)" : "var(--ink-2)", color: "var(--paper)", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: "-0.02em" }}>{daysLabel ?? "—"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", marginTop: 4 }}>days</div>
            </div>
            <div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.015em", margin: 0 }}>
                {nextReg?.event?.title_sq ?? "—"}
              </h3>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".06em", color: "var(--ink-3)", marginTop: 4 }}>
                {raceLine}
              </div>
            </div>
          </div>
        </div>

        <div className="pcard dark" style={{ background: "var(--ink)", color: "var(--paper)", borderRadius: 14, padding: 24 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0, color: "var(--paper)" }}>Anëtarësia</h2>
          <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--slate)" }}>
            {dues.length === 0 ? "Status: paguar / s'ka dues të krijuara" : `${dues.length} pa paguar · €${unpaidTotal.toFixed(2)}`}
          </div>
          <Link href="/portal/profile" className="btn" style={{ marginTop: 20, background: "transparent", borderColor: "rgba(244,242,236,.3)", color: "var(--paper)" }}>
            Profili & dokumentet →
          </Link>
        </div>
      </div>
    </>
  );
}
