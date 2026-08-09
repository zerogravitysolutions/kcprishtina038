"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/errors";
import { generateInvoices } from "./actions";

/**
 * Runs the monthly generation for one period. The RPC is idempotent, so the
 * copy tells the owner outright that pressing it again is harmless — otherwise
 * they will assume a second press doubles everyone's bill.
 */
export function GenerateInvoices({
  period, label, when = "current",
}: {
  period: string;
  label: string;
  /** Where the shown month sits relative to today. Future months cannot be
   * generated at all; past ones can (backfill), but the invoices land already
   * past their due date, so the copy says so before the click. */
  when?: "past" | "current" | "future";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function created(n: number): string {
    if (n === 0) return "Nuk u krijua asnjë faturë e re: ose ekzistojnë tashmë, ose nuk ka anëtarësi me pagesë për këtë muaj.";
    if (n === 1) return "U krijua 1 faturë.";
    return `U krijuan ${n} fatura.`;
  }

  function run() {
    setMsg(null);
    start(async () => {
      try {
        const r = await generateInvoices(period);
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setMsg({ ok: true, text: created(r.created) });
        router.refresh();
      } catch (e) {
        const text = actionError(e, "Gjenerimi i faturave dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  if (when === "future") {
    return (
      <div style={{ textAlign: "right", maxWidth: 260 }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7 }}>
          {label} nuk ka filluar ende. Faturat gjenerohen në fillim të muajit.
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button type="button" className="btn btn-ember" onClick={run} disabled={pending}>
        {pending ? "Duke gjeneruar…" : `Gjenero faturat për ${label}`}
      </button>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", marginTop: 8 }}>
        Mund ta shtypësh disa herë — fatura e dyfishtë nuk krijohet.
      </div>
      {when === "past" ? (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--warn)", marginTop: 6, maxWidth: 300, lineHeight: 1.7 }}>
          Kujdes: {label} ka kaluar — këto fatura krijohen menjëherë në vonesë dhe nuk fshihen dot.
        </div>
      ) : null}
      {msg ? <div className={`mm-msg ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 6 }}>{msg.text}</div> : null}
    </div>
  );
}
