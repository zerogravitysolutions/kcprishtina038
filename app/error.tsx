"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);


  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--paper, #F4F2EC)", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560, padding: 32, background: "white", border: "1px solid rgba(15,26,46,.1)", borderRadius: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0F1A2E" }}>
          Faqja nuk u ngarkua
        </h1>
        <p style={{ marginTop: 12, fontSize: 14.5, color: "#1B2742", lineHeight: 1.6 }}>
          Na vjen keq, nuk arritëm ta hapim këtë faqe. Provo sërish pas pak.
          Nëse problemi vazhdon, kontakto klubin për ndihmë.
          {error.digest && <span style={{ display: "block", marginTop: 8, fontFamily: "monospace", fontSize: 11, color: "#A4ADB6" }}>Kodi i gabimit: {error.digest}</span>}
        </p>
        <button onClick={() => reset()} style={{ marginTop: 20, padding: "10px 16px", background: "#C25A2D", color: "white", border: 0, borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          Provo sërish
        </button>
      </div>
    </div>
  );
}
