"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  const isEnvMissing = error.message?.includes("Supabase env vars missing");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--paper, #F4F2EC)", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560, padding: 32, background: "white", border: "1px solid rgba(15,26,46,.1)", borderRadius: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0F1A2E" }}>
          {isEnvMissing ? "Konfigurimi nuk është i plotë" : "Diçka shkoi keq"}
        </h1>
        {isEnvMissing ? (
          <>
            <p style={{ marginTop: 12, fontSize: 14.5, color: "#1B2742", lineHeight: 1.6 }}>
              Variablat e mjedisit të Supabase nuk janë vendosur në këtë publikim.
              Faqja nuk do të funksionojë derisa ato të konfigurohen.
            </p>
            <ol style={{ marginTop: 16, fontSize: 14, color: "#1B2742", lineHeight: 1.6 }}>
              <li>Hap Vercel Dashboard → <code>kcprishtina038</code> → Settings → Environment Variables.</li>
              <li>
                Shto këto dy për <strong>Production + Preview + Development</strong>:
                <pre style={{ background: "#0F1A2E", color: "#F4F2EC", padding: 12, borderRadius: 8, fontSize: 12, marginTop: 8, overflowX: "auto" }}>
{`NEXT_PUBLIC_SUPABASE_URL=https://xutklvcsdgzmhxzexisb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cB3Hl2_07OqDyV-U5exvbQ_WiTjKx6M`}
                </pre>
              </li>
              <li>Nis një ripublikim (Deployments → ⋯ → Redeploy).</li>
            </ol>
          </>
        ) : (
          <p style={{ marginTop: 12, fontSize: 14.5, color: "#1B2742" }}>
            {error.message || "Gabim i brendshëm"}
            {error.digest && <span style={{ display: "block", marginTop: 8, fontFamily: "monospace", fontSize: 11, color: "#A4ADB6" }}>Trace: {error.digest}</span>}
          </p>
        )}
        <button onClick={() => reset()} style={{ marginTop: 20, padding: "10px 16px", background: "#C25A2D", color: "white", border: 0, borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          Provo sërish
        </button>
      </div>
    </div>
  );
}
