import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Faqja nuk u gjet",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--paper, #F4F2EC)", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, padding: 32, background: "white", border: "1px solid rgba(15,26,46,.1)", borderRadius: 14 }}>
        <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#A4ADB6" }}>
          Gabim 404
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "10px 0 0", color: "#0F1A2E" }}>
          Faqja nuk u gjet.
        </h1>
        <p style={{ marginTop: 12, fontSize: 14.5, color: "#1B2742", lineHeight: 1.6 }}>
          Lidhja që hape nuk ekziston ose përmbajtja është hequr. Kontrollo adresën ose kthehu në ballinë.
        </p>
        <Link
          href="/"
          style={{ display: "inline-block", marginTop: 20, padding: "10px 16px", background: "#C25A2D", color: "white", borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        >
          Kthehu në ballinë
        </Link>
      </div>
    </div>
  );
}
