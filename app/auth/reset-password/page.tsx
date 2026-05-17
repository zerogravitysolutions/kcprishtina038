import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Reseto fjalëkalimin",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div style={{ background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "40px 20px" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "var(--white)", border: "1px solid color-mix(in oklab, var(--ink) 10%, transparent)", borderRadius: 14, padding: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <img src="/assets/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 999 }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.015em" }}>KÇ Prishtina 038</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 3 }}>Reseto fjalëkalimin</div>
          </div>
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, letterSpacing: "-0.025em", margin: 0 }}>Vendos fjalëkalim të ri.</h1>
        <p style={{ marginTop: 8, fontSize: 14.5, color: "var(--ink-2)" }}>Fjalëkalimi duhet të jetë të paktën 8 karaktere.</p>
        <ResetForm />
      </div>
    </div>
  );
}
