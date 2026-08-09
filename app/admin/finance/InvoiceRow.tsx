"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import {
  EFFECTIVE_STATUS_LABEL, EFFECTIVE_STATUS_TONE, PAID_METHOD_LABEL,
  daysOverdue, dueDateOf, effectiveStatus, formatEur, periodLabel,
} from "@/lib/finance";
import type { DuesStatus, PaidMethod } from "@/lib/supabase/types";
import { markInvoicePaid, reopenInvoice, waiveInvoice } from "./actions";

/** One invoice as the list renders it — flattened by the page, not embedded. */
export type InvoiceView = {
  id: string;
  invoice_no: string | null;
  period: string;
  due_date: string | null;
  amount_eur: number;
  status: DuesStatus;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  notes: string | null;
  member_name: string;
  member_email: string;
  /** Plan name from the linked membership; null on invoices with no membership. */
  plan_name: string | null;
  /** false = the rider's tier is outside billing (a racer). */
  plan_billable: boolean | null;
};

/** Only real money moves are pickable — 'waived' is set by the "Fal" action. */
const METHODS: PaidMethod[] = ["cash", "bank", "online"];

function initials(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?";
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function InvoiceRow({ inv, canWrite }: { inv: InvoiceView; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [payOpen, setPayOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [method, setMethod] = useState<PaidMethod>("cash");
  const [date, setDate] = useState(todayIso());
  const [payNote, setPayNote] = useState("");
  const [reason, setReason] = useState("");

  const status = effectiveStatus(inv);
  const late = daysOverdue(inv);
  // dueDateOf(), not due_date, so a legacy row with no due_date shows the same
  // period + 14 days the status badge is derived from. Printing the raw period
  // there made an invoice look overdue on a date that had not passed yet.
  const due = dueDateOf(inv);
  const settled = status === "paid" || status === "waived";
  // Never print "Invalid Date" if the stored timestamp is unparseable.
  const paidAt = inv.paid_at ? new Date(inv.paid_at) : null;
  const paidAtLabel = paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toLocaleDateString("sq") : null;

  function openPay() {
    setErr(null);
    setMethod("cash");
    setDate(todayIso());
    setPayNote("");
    setPayOpen(true);
  }

  function openWaive() {
    setErr(null);
    setReason("");
    setWaiveOpen(true);
  }

  // Server Actions here return { ok, error }; a throw (e.g. "forbidden") is
  // masked by React in production, so actionError() supplies the Albanian text.
  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, close: () => void) {
    setErr(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setErr(r.error); return; }
        close();
        router.refresh();
      } catch (e) {
        const msg = actionError(e, "Veprimi dështoi. Provo sërish.");
        if (msg) setErr(msg);
        else { close(); router.refresh(); }
      }
    });
  }

  return (
    <>
      <tr>
        <td>
          <div className="person">
            <div className="avatar">{initials(inv.member_name)}</div>
            <div className="nm">{inv.member_name}<small>{inv.member_email}</small></div>
          </div>
        </td>
        <td data-lab="Plani">
          <span>
            {inv.plan_name ?? "Pa plan"}
            {inv.plan_billable === false ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                Nuk faturohet
              </small>
            ) : null}
          </span>
        </td>
        <td className="mono" data-lab="Fatura">
          <span>
            {inv.invoice_no ?? "Pa numër"}
            <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {periodLabel(inv.period)}
            </small>
          </span>
        </td>
        <td className="num" data-lab="Shuma">{formatEur(inv.amount_eur)}</td>
        <td className="mono" data-lab="Afati">
          <span>
            {due ? due.toLocaleDateString("sq") : "Pa afat"}
            {late > 0 ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--err)", marginTop: 2 }}>
                {late} ditë vonesë
              </small>
            ) : null}
          </span>
        </td>
        <td data-lab="Statusi">
          <span>
            <span className={`badge-st ${EFFECTIVE_STATUS_TONE[status]}`}>{EFFECTIVE_STATUS_LABEL[status]}</span>
            {settled ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                {inv.paid_method ? PAID_METHOD_LABEL[inv.paid_method] : "Mënyra e pashënuar"}
                {paidAtLabel ? ` · ${paidAtLabel}` : ""}
              </small>
            ) : null}
          </span>
        </td>
        <td className="actions">
          {/* New tab, like every other document in the admin panel: the print
              view is a dead end, and staff are usually mid-way through a month
              they do not want to lose. */}
          <a
            className="btn btn-ghost btn-sm"
            href={`/invoice/${inv.id}`}
            target="_blank"
            rel="noopener"
            style={{ marginRight: 6 }}
          >
            Printo ↗
          </a>
          {!canWrite ? (
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>Vetëm shikim</span>
          ) : settled ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setErr(null); setUndoOpen(true); }}>
              Zhbëj
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ember btn-sm" onClick={openPay} disabled={pending}>
                Shëno si të paguar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 6 }}
                onClick={openWaive}
                disabled={pending}
              >
                Fal
              </button>
            </>
          )}
        </td>
      </tr>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Regjistro pagesën"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPayOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              disabled={pending}
              onClick={() => run(() => markInvoicePaid(inv.id, { method, date, notes: payNote }), () => setPayOpen(false))}
            >
              {pending ? "Duke ruajtur…" : "Ruaj pagesën"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 14 }}>
          {inv.member_name} · {periodLabel(inv.period)} · <strong>{formatEur(inv.amount_eur)}</strong>
        </div>
        <div className="field">
          <label htmlFor={`m-${inv.id}`}>Mënyra e pagesës</label>
          <select id={`m-${inv.id}`} value={method} onChange={(e) => setMethod(e.target.value as PaidMethod)}>
            {METHODS.map((m) => <option key={m} value={m}>{PAID_METHOD_LABEL[m]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`d-${inv.id}`}>Data e pagesës</label>
          <input id={`d-${inv.id}`} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`n-${inv.id}`}>Shënim (opsional)</label>
          <input id={`n-${inv.id}`} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="p.sh. numri i dëftesës" />
        </div>
        {err ? <div className="mm-msg err">{err}</div> : null}
      </Modal>

      <Modal
        open={waiveOpen}
        onClose={() => setWaiveOpen(false)}
        title="Fal faturën"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWaiveOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              disabled={pending || reason.trim().length < 3}
              onClick={() => run(() => waiveInvoice(inv.id, reason), () => setWaiveOpen(false))}
            >
              {pending ? "Duke ruajtur…" : "Fal faturën"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 14 }}>
          Fatura e <strong>{inv.member_name}</strong> për {periodLabel(inv.period)} ({formatEur(inv.amount_eur)}) nuk
          do të kërkohet më. Arsyeja ruhet te fatura.
        </div>
        <div className="field">
          <label htmlFor={`r-${inv.id}`}>Arsyeja</label>
          <textarea
            id={`r-${inv.id}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="p.sh. lirim për arsye sociale"
          />
        </div>
        {err ? <div className="mm-msg err">{err}</div> : null}
      </Modal>

      <ConfirmModal
        open={undoOpen}
        onClose={() => setUndoOpen(false)}
        title="Zhbëj pagesën"
        tone="danger"
        confirmLabel="Zhbëj"
        message={
          <>
            Fatura e <strong>{inv.member_name}</strong> për {periodLabel(inv.period)} kthehet në
            “Papaguar” dhe të dhënat e pagesës fshihen. Fatura vetë nuk fshihet.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await reopenInvoice(inv.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Zhbërja e pagesës dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />
    </>
  );
}
