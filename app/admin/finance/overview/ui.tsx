import Link from "next/link";

/** One headline figure. Shared by all three views so they read as one page. */
export function Kpi({
  label, value, sub, accent, tone,
}: { label: string; value: string; sub?: string; accent?: string; tone?: "err" }) {
  return (
    <div className="kpi">
      <div className="lab" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {accent ? <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} /> : null}
        {label}
      </div>
      <div className="val" style={tone === "err" ? { color: "var(--err)" } : undefined}>{value}</div>
      {sub ? <div className="delta">{sub}</div> : null}
    </div>
  );
}

/**
 * One figure that is deliberately NOT part of the balance. Each carries its own
 * sentence saying what it counts and why it is not cash, plus a link to the ONE
 * screen where its detail lives — the totals stay here, the rows do not.
 */
export function OutsideCard({
  title, value, note, tone, href, hrefLabel,
}: {
  title: string;
  value: string;
  note: string;
  tone: "warn" | "err" | "neutral";
  href: string;
  hrefLabel: string;
}) {
  const color = tone === "err" ? "var(--err)" : tone === "warn" ? "var(--warn)" : "var(--text-2)";
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={{ fontSize: 14.5 }}>{title}</h3>
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: "-0.01em" }}>{value}</div>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>{note}</p>
      <Link
        href={href}
        className="mono"
        style={{ display: "inline-block", marginTop: 12, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent)" }}
      >
        {hrefLabel} →
      </Link>
    </div>
  );
}

/** The same failure card all three views show when a select comes back broken. */
export function LoadError({ message }: { message: string }) {
  return (
    <div className="card">
      <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>{message}</p>
      <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
        Pasqyra nuk shfaqet me shifra të paplota, sepse një total i gabuar është më keq se asnjë total.
        Nëse kjo përsëritet, ka gjasa që skema e financave nuk është aplikuar ende në bazën e të dhënave.
      </p>
    </div>
  );
}

/** Says which reads hit their cap, so no figure is quietly cut short. */
export function TruncationWarning({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;
  return (
    <div className="mono" style={{ fontSize: 11, color: "var(--err)", margin: "0 0 12px", lineHeight: 1.7 }}>
      Kujdes: janë lexuar vetëm rreshtat e parë për {parts.join(", ")}. Shifrat më poshtë nuk e mbulojnë
      gjithë historikun.
    </div>
  );
}
