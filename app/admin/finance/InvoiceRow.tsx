"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import {
  DISCOUNT_REASON_MAX, EFFECTIVE_STATUS_LABEL, EFFECTIVE_STATUS_TONE, HALF_PRICE_DEFAULT_REASON,
  PAID_METHOD_LABEL, daysOverdue, discountReasonLabel, dueDateOf, effectiveStatus, formatEur,
  halfOf, isReduced, issuedDateLabel, periodLabel, toEuros,
} from "@/lib/finance";
import type { DuesStatus, PaidMethod } from "@/lib/supabase/types";
import { deleteInvoice, markInvoicePaid, reopenInvoice, setInvoiceHalfPrice, waiveInvoice } from "./actions";

/** One invoice as the list renders it — flattened by the page, not embedded. */
export type InvoiceView = {
  id: string;
  invoice_no: string | null;
  period: string;
  due_date: string | null;
  issued_on: string | null;
  amount_eur: number;
  status: DuesStatus;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  notes: string | null;
  /** The undiscounted price while the invoice is at half price; null = not
   * reduced (never "a full price of €0"). amount_eur is what is owed. */
  full_amount_eur: number | null;
  discount_reason: string | null;
  /** The prepayment that settled this invoice (migration 20260913000001), and
   * its months as "Shtator–Nëntor 2026" when they could be read. */
  prepayment_id: string | null;
  prepay_label: string | null;
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

/**
 * `canDelete` is admin-only and therefore narrower than `canWrite` (admin +
 * staff). Hiding the button is only tidiness — deleteInvoice() re-checks the
 * role and the account status itself, because a Server Action is a POST
 * endpoint that anyone can call directly.
 *
 * `today` is the CLUB's calendar day, computed on the server: it prefills and
 * caps the payment date. Reading the browser clock in the useState initialiser
 * made SSR (UTC) and hydration (Kosovo) disagree for the first hour or two
 * after midnight.
 */
export function InvoiceRow({
  inv, today, canWrite, canDelete = false,
}: { inv: InvoiceView; today: string; canWrite: boolean; canDelete?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [payOpen, setPayOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [halfOpen, setHalfOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [method, setMethod] = useState<PaidMethod>("cash");
  const [date, setDate] = useState(today);
  const [payNote, setPayNote] = useState("");
  const [reason, setReason] = useState("");
  const [halfReason, setHalfReason] = useState(HALF_PRICE_DEFAULT_REASON);

  const status = effectiveStatus(inv);
  const late = daysOverdue(inv);
  // dueDateOf(), not due_date, so a legacy row with no due_date shows the same
  // period + 14 days the status badge is derived from. Printing the raw period
  // there made an invoice look overdue on a date that had not passed yet.
  const due = dueDateOf(inv);
  // The invoice date (dues.issued_on). New rows carry one; legacy rows do not
  // (created_at is not loaded into the list), so it is simply omitted then —
  // never "Invalid Date".
  const issued = issuedDateLabel(inv.issued_on);
  const settled = status === "paid" || status === "waived";
  // Never print "Invalid Date" if the stored timestamp is unparseable.
  const paidAt = inv.paid_at ? new Date(inv.paid_at) : null;
  const paidAtLabel = paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toLocaleDateString("sq") : null;

  // Named in the delete copy on purpose: the number is the thing that does NOT
  // come back. dues_invoice_counters is never rewound, so a regenerated invoice
  // takes the next free number — reusing this one would give two different
  // invoices the same number.
  const invoiceNo = inv.invoice_no;
  const methodLabel = inv.paid_method ? PAID_METHOD_LABEL[inv.paid_method] : null;
  const amount = formatEur(inv.amount_eur);
  const period = periodLabel(inv.period);
  // Half price. Only an OPEN invoice is repriced (set_due_half_price refuses
  // paid and waived rows too): changing a paid invoice's amount would leave
  // the money on record and the amount on the invoice disagreeing.
  const reduced = isReduced(inv);
  const fullLabel = reduced ? formatEur(inv.full_amount_eur) : null;
  const halfLabel = formatEur(halfOf(inv.amount_eur));
  const canHalve = !settled && !reduced && toEuros(inv.amount_eur) > 0;
  const halfReasonTrim = halfReason.trim();

  function openPay() {
    setErr(null);
    setMethod("cash");
    setDate(today);
    setPayNote("");
    setPayOpen(true);
  }

  function openWaive() {
    setErr(null);
    setReason("");
    setWaiveOpen(true);
  }

  function openHalf() {
    setErr(null);
    setHalfReason(HALF_PRICE_DEFAULT_REASON);
    setHalfOpen(true);
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
        <td className="num" data-lab="Shuma">
          {reduced ? (
            // What is owed first, the full price muted beside it: the list's
            // totals sum amount_eur, so the big number must be that one.
            <span>
              {amount}
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                nga <s>{fullLabel}</s>
              </small>
              <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                ½ · {discountReasonLabel(inv)}
              </small>
            </span>
          ) : amount}
        </td>
        <td className="mono" data-lab="Afati">
          <span>
            {due ? due.toLocaleDateString("sq") : "Pa afat"}
            {issued ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                Lëshuar {issued}
              </small>
            ) : null}
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
            {inv.prepayment_id ? (
              // One line of a prepayment: the marker opens the group's document,
              // which is also where an admin undoes it as a whole.
              <a
                href={`/invoice/prepay/${inv.prepayment_id}`}
                target="_blank"
                rel="noopener"
                title={inv.prepay_label ? `Parapagim · ${inv.prepay_label}` : "Parapagim"}
                style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", minHeight: 44, textDecoration: "none" }}
              >
                <span className="badge-st ember">Parapaguar ↗</span>
                {inv.prepay_label ? (
                  <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {inv.prepay_label}
                  </small>
                ) : null}
              </a>
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
          ) : settled && inv.prepayment_id ? (
            // Reopened or deleted alone, it would disagree with its
            // prepayment; the whole group is undone from its document.
            null
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
              {reduced ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={() => { setErr(null); setFullOpen(true); }}
                  disabled={pending}
                >
                  Kthe çmimin e plotë
                </button>
              ) : canHalve ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={openHalf}
                  disabled={pending}
                >
                  Gjysmë çmimi
                </button>
              ) : null}
            </>
          )}
          {canDelete && !inv.prepayment_id ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 6, color: "var(--err)" }}
              onClick={() => { setErr(null); setDelOpen(true); }}
              disabled={pending}
            >
              Fshij
            </button>
          ) : null}
        </td>
      </tr>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Regjistro pagesën"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={() => setPayOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              style={{ minHeight: 44 }}
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
          <input id={`d-${inv.id}`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
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
            <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={() => setWaiveOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              style={{ minHeight: 44 }}
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

      {/* Half price — for a member away on holiday. The confirmation names the
          change itself ("€40.00 → €20.00"), and the reason is printed on the
          member's invoice, so it is prefilled with the common case rather than
          left blank. */}
      <Modal
        open={halfOpen}
        onClose={() => { if (!pending) setHalfOpen(false); }}
        title="Gjysmë çmimi"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={() => setHalfOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              style={{ minHeight: 44 }}
              disabled={pending || halfReasonTrim.length > DISCOUNT_REASON_MAX}
              onClick={() => run(() => setInvoiceHalfPrice(inv.id, true, halfReasonTrim), () => setHalfOpen(false))}
            >
              {pending ? "Duke ruajtur…" : "Konfirmo"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 6 }}>
          {inv.member_name} · {period}
        </div>
        <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-1)", marginBottom: 14 }}>
          {amount} → {halfLabel}
        </div>
        <div className="field">
          <label htmlFor={`h-${inv.id}`}>Arsyeja</label>
          <input
            id={`h-${inv.id}`}
            value={halfReason}
            maxLength={DISCOUNT_REASON_MAX}
            onChange={(e) => setHalfReason(e.target.value)}
            placeholder={HALF_PRICE_DEFAULT_REASON}
          />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6 }}>
          Arsyeja shfaqet te fatura e anëtarit. Çmimi i plotë ruhet dhe mund ta kthesh
          sa kohë fatura është e papaguar.
        </div>
        {err ? <div className="mm-msg err">{err}</div> : null}
      </Modal>

      <ConfirmModal
        open={fullOpen}
        onClose={() => setFullOpen(false)}
        title="Kthe çmimin e plotë"
        confirmLabel="Konfirmo"
        message={
          <>
            Fatura e <strong>{inv.member_name}</strong> për {period} kthehet nga{" "}
            <strong className="mono">{amount}</strong> në <strong className="mono">{fullLabel}</strong>. Arsyeja e
            zbritjes ({discountReasonLabel(inv)}) hiqet.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await setInvoiceHalfPrice(inv.id, false);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Ndryshimi i çmimit dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />

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

      {/* Deleting is not "one more action": for a paid invoice it destroys a
          record of money that was actually received, so the confirmation names
          the amount, the member and the payment date instead of asking a
          generic "are you sure". An unpaid invoice gets the light version. */}
      <ConfirmModal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title={status === "paid" ? "Fshij një faturë të paguar" : status === "waived" ? "Fshij një faturë të falur" : "Fshij faturën"}
        tone="danger"
        confirmLabel={settled ? "Fshij përfundimisht" : "Fshij faturën"}
        message={
          <>
            {status === "paid" ? (
              <>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Kjo faturë është regjistrim i parave të arkëtuara.</strong>{" "}
                  <strong>{inv.member_name}</strong> ka paguar <strong>{amount}</strong>
                  {paidAtLabel ? <> më <strong>{paidAtLabel}</strong></> : null}
                  {methodLabel ? ` (${methodLabel})` : null} për {period}
                  {invoiceNo ? <>, faturë <span className="mono">{invoiceNo}</span></> : null}. Nëse e fshin, ky
                  arkëtim nuk mbetet askund — as i paguar, as i falur, as borxh — dhe totali i arkëtuar
                  për {period} zvogëlohet me {amount}.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  Nëse e gabuar është vetëm pagesa e regjistruar, mbylle këtë dhe përdor “Zhbëj”: fatura
                  mbetet, pagesa hiqet.
                </p>
              </>
            ) : status === "waived" ? (
              <>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Kjo faturë është e falur.</strong> Fshirja zhduk edhe faljen, edhe arsyen e saj
                  ({amount} · {inv.member_name} · {period}
                  {invoiceNo ? <> · <span className="mono">{invoiceNo}</span></> : null}). Nuk mbetet gjurmë se
                  kjo faturë u lëshua dhe iu fal dikujt.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  Nëse e gabuar është vetëm falja, mbylle këtë dhe përdor “Zhbëj”.
                </p>
              </>
            ) : (
              <p style={{ margin: "0 0 10px" }}>
                Fatura {invoiceNo ? <span className="mono">{invoiceNo}</span> : "pa numër"} e{" "}
                <strong>{inv.member_name}</strong> për {period} ({amount}) hiqet plotësisht nga regjistri.
                Nuk ka pagesë të regjistruar në të.
              </p>
            )}
            <p style={{ margin: "0 0 10px" }}>
              Pas fshirjes, {inv.member_name} lirohet për {period}, kështu që muaji mund të gjenerohet
              sërish — me dorë, ose nga gjenerimi automatik nëse dita e tij ende nuk ka kaluar.{" "}
              {invoiceNo ? (
                <>Fatura e re merr numër të ri; numri <span className="mono">{invoiceNo}</span> nuk ripërdoret kurrë.</>
              ) : (
                <>Fatura e re merr numër të ri.</>
              )}
            </p>
            <p style={{ margin: 0 }}>
              Fshirja shënohet në ditarin e veprimeve me emrin tënd dhe me të gjitha të dhënat e faturës.
              Vetë fatura nuk kthehet dot.
            </p>
          </>
        }
        onConfirm={async () => {
          try {
            const r = await deleteInvoice(inv.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Fshirja e faturës dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />
    </>
  );
}
