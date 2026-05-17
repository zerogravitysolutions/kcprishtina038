import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Identifikohu",
  description: "Hyr në llogarinë e KÇ Prishtina 038.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const profile = await getProfile();
  const params = await searchParams;
  if (profile && profile.status === "active") {
    redirect((profile.role === "member" ? "/portal" : "/admin/dashboard") as never);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div className="login-side" style={{ background: "var(--ink)", padding: 64, display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--paper)" }}>
        <Link href="/" className="brand-block" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--paper)" }}>
          <img src="/assets/logo.jpg" alt="" style={{ width: 40, height: 40, borderRadius: 999 }} />
          <div>
            <div className="kc" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>KÇ Prishtina 038</div>
            <div className="sub" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--slate)", marginTop: 3 }}>Klubi Çiklistik · Prishtinë</div>
          </div>
        </Link>
        <div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ember)" }}>Sezoni 2026 · në aksion</span>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(32px, 3.4vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.05, color: "var(--paper)", margin: "20px 0 0" }}>
            Mbi qiellin e <em style={{ fontStyle: "italic", fontVariationSettings: "'wdth' 75", color: "var(--ember)" }}>Prishtinës</em>,<br />vetëm ne pedalojmë.
          </h2>
        </div>
      </div>

      <div className="login-form" style={{ padding: 48, display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--paper)" }}>
        <Link href="/" style={{ position: "absolute", top: 24, right: 24, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          ← Kthehu te faqja
        </Link>
        <div className="login-card" style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(32px, 3vw, 44px)", letterSpacing: "-0.03em", margin: 0 }}>Mirë se erdhe.</h1>
          <p style={{ marginTop: 12, fontSize: 15, color: "var(--ink-2)" }}>Identifikohu për të hyrë në llogarinë tënde.</p>
          <div style={{ marginTop: 32 }}>
            <LoginForm next={params.next ?? null} />
          </div>
          <p style={{ marginTop: 32, textAlign: "center", fontSize: 13.5, color: "var(--ink-2)" }}>
            Nuk ke ende llogari? <Link href="/join" style={{ color: "var(--ember-deep)", borderBottom: "1px solid color-mix(in oklab, var(--ember) 40%, transparent)" }}>Apliko si anëtar →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
