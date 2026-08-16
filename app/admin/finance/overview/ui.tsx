import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The club's position SINCE IT STARTED — the band that opens the Arka view.
 *
 * It is deliberately NOT a <Kpi>. The trio below it carries the very same three
 * words (Hyrjet / Daljet / Bilanci) over a DIFFERENT window, and two figures
 * that look alike but count different rows is the exact defect this panel has
 * been bitten by twice. So this one is inked rather than white, sits ABOVE the
 * year chips — outside the region they control — states its window on itself,
 * and carries the sentence that explains why the years below will not add up to
 * it. Different treatment, not merely different text.
 *
 * Every string arrives already formatted: an unknown amount must be able to
 * arrive as words ("Pa shumë", "së paku €…") rather than as a confident number,
 * so this component never touches euros itself.
 */
export function AllTimeBalance({
  window, income, incomeSub, spent, spentSub, balance, balanceSub, negative, note, warning,
}: {
  /** Printed on the card, in words: the whole point is that it says so itself. */
  window: string;
  income: string;
  incomeSub: string;
  spent: string;
  spentSub: string;
  balance: string;
  balanceSub: string;
  /** Colours the balance red. Only when it is a real figure and really negative. */
  negative?: boolean;
  note: ReactNode;
  /** Why the figures are short (a read hit its cap). Rendered in red, or nothing. */
  warning?: string | null;
}) {
  return (
    <section className="alltime">
      <div className="alltime-head">
        <h2>Bilanci total i klubit</h2>
        <span className="alltime-win">{window}</span>
      </div>
      <div className="alltime-figs">
        <div className="alltime-fig">
          <div className="lab"><span className="dot" style={{ background: "#4ADE80" }} />Hyrjet gjithsej</div>
          <div className="val">{income}</div>
          <div className="sub">{incomeSub}</div>
        </div>
        <div className="alltime-fig">
          <div className="lab"><span className="dot" style={{ background: "#FB8B5E" }} />Daljet gjithsej</div>
          <div className="val">{spent}</div>
          <div className="sub">{spentSub}</div>
        </div>
        <div className={`alltime-fig main${negative ? " neg" : ""}`}>
          <div className="lab"><span className="dot" style={{ background: negative ? "#FF9B93" : "#2DD4BF" }} />Bilanci total</div>
          <div className="val">{balance}</div>
          <div className="sub">{balanceSub}</div>
        </div>
      </div>
      <p className="alltime-note">{note}</p>
      {warning ? <p className="alltime-warn">{warning}</p> : null}
    </section>
  );
}

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
  title, value, note, tone, href, hrefLabel, window,
}: {
  title: string;
  value: string;
  note: string;
  tone: "warn" | "err" | "neutral";
  href: string;
  hrefLabel: string;
  /**
   * The window the figure covers, printed beside it. Some of these are annual
   * flows and some are positions that deliberately ignore the year (open
   * debt); a reader cannot tell which by looking, so each one says.
   */
  window: string;
}) {
  const color = tone === "err" ? "var(--err)" : tone === "warn" ? "var(--warn)" : "var(--text-2)";
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={{ fontSize: 14.5 }}>{title}</h3>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          className="mono"
          style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-3)" }}>
          {window}
        </span>
      </div>
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
