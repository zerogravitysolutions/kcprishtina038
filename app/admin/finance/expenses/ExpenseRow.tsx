"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Lightbox } from "@/components/ui/Lightbox";
import { actionError } from "@/lib/errors";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_SPONSOR_LABEL,
  beneficiaryLabel, expenseAmountLabel, formatDate, invoiceNoLabel, isOwedToMember, paidByLabel,
} from "@/lib/finance";
import { deleteExpense, setReimbursed } from "./actions";
import { ExpenseDetail } from "./ExpenseDetail";
import { ExpenseFormModal, type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
import { receiptPublicUrl } from "./receipt";

export function ExpenseRow({
  expense, options, canWrite, canDelete,
}: {
  expense: ExpenseView;
  options: ExpenseOptions;
  /** admin + staff record money. */
  canWrite: boolean;
  /** Only the admin removes a ledger line — see deleteExpense(). */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Every stored path resolved to a public URL, dropping any that cannot be
  // built (e.g. missing env) so the thumbnail count matches what opens.
  const receiptUrls = expense.receipt_paths
    .map((p) => receiptPublicUrl(p))
    .filter((u): u is string => !!u);
  const receiptCount = receiptUrls.length;

  const nameOf = (id: string) => options.members.find((m) => m.id === id)?.full_name ?? null;
  // A cost charged to a sponsor whose row is gone (or outside the list this
  // page loaded) still says it is charged to somebody — dropping the line would
  // quietly turn a sponsored cost into a club cost.
  const sponsorName = expense.funding_sponsor_id
    ? options.sponsors.find((s) => s.id === expense.funding_sponsor_id)?.name ?? UNKNOWN_SPONSOR_LABEL
    : null;

  const owed = isOwedToMember(expense);
  const payer = paidByLabel(expense, nameOf);

  function markReimbursed() {
    setErr(null);
    start(async () => {
      try {
        const r = await setReimbursed(expense.id, { reimbursed: true, note });
        if (!r.ok) { setErr(r.error); return; }
        setPayOpen(false);
        router.refresh();
      } catch (e) {
        const msg = actionError(e, "Shënimi i rimbursimit dështoi. Provo sërish.");
        if (msg) setErr(msg);
        else { setPayOpen(false); router.refresh(); }
      }
    });
  }

  return (
    <>
      <tr>
        <td className="mono" data-lab="Data">
          <button type="button" className="exp-open exp-open-date" onClick={() => setDetailOpen(true)}>
            {formatDate(expense.occurred_on)}
          </button>
        </td>

        <td>
          <div className="exp-desc">
            {/* The receipt is the proof, so it sits WITH the description rather
                than in the crowded actions column: on a phone the row is a
                card and this is the first thing under the date. One tap opens
                the lightbox on the first photo; the rest are one swipe away. */}
            {receiptCount > 0 ? (
              <button
                type="button"
                className="rc-thumb"
                style={{ position: "relative" }}
                onClick={() => setPhotoOpen(true)}
                title={receiptCount > 1 ? `Hap ${receiptCount} foto të faturës` : "Hap foton e faturës"}
                aria-label={
                  receiptCount > 1
                    ? `Hap ${receiptCount} foto të faturës për “${expense.description}”`
                    : `Hap foton e faturës për “${expense.description}”`
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptUrls[0]} alt="" loading="lazy" decoding="async" />
                {receiptCount > 1 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute", right: 0, bottom: 0,
                      background: "color-mix(in oklab, var(--surface-1) 82%, transparent)",
                      color: "var(--text-1)", fontSize: 10, lineHeight: 1, fontWeight: 600,
                      padding: "2px 4px", borderTopLeftRadius: "var(--r-xs)",
                    }}
                  >
                    {receiptCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            {/* The primary tap target: one tap opens the read-only detail view.
                It is a sibling of the receipt thumbnail button, so tapping the
                photo opens the lightbox and never the detail — no propagation
                juggling needed. The per-row actions live in their own cell. */}
            <button type="button" className="exp-open" onClick={() => setDetailOpen(true)}>
              {expense.description}
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                {expense.category_name}
                {expense.invoice_no ? ` · ${invoiceNoLabel(expense.invoice_no)}` : ""}
                {sponsorName ? ` · burimi: ${sponsorName}` : ""}
              </small>
              {expense.notes ? (
                <small style={{ display: "block", fontSize: 11.5, color: "var(--text-2)", marginTop: 4 }}>
                  {expense.notes}
                </small>
              ) : null}
            </button>
          </div>
        </td>

        <td data-lab="Për kë">{beneficiaryLabel(expense, nameOf)}</td>

        <td className="num" data-lab="Shuma">{expenseAmountLabel(expense)}</td>

        <td data-lab="Paguar nga">
          <span>
            {payer}
            {expense.paid_by === "member" ? (
              <small
                style={{
                  display: "block", fontSize: 11, marginTop: 3,
                  color: owed ? "var(--err)" : "var(--text-3)",
                }}
              >
                {owed
                  ? "klubi ia ka borxh"
                  : `rimbursuar${expense.reimbursed_note ? ` · ${expense.reimbursed_note}` : ""}`}
              </small>
            ) : expense.payment_method ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                {EXPENSE_PAYMENT_METHOD_LABEL[expense.payment_method]}
              </small>
            ) : null}
          </span>
        </td>

        <td data-lab="Statusi">
          <span className={`badge-st ${EXPENSE_STATUS_TONE[expense.status]}`}>
            {EXPENSE_STATUS_LABEL[expense.status]}
          </span>
        </td>

        <td className="actions">
          {!canWrite ? (
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>Vetëm shikim</span>
          ) : (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
                Ndrysho
              </button>
              {owed ? (
                <button
                  type="button"
                  className="btn btn-ember btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={() => { setErr(null); setNote(""); setPayOpen(true); }}
                >
                  Shëno si të rimbursuar
                </button>
              ) : null}
              {expense.reimbursed ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={() => { setErr(null); setUndoOpen(true); }}
                >
                  Zhbëj rimbursimin
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={() => { setErr(null); setDelOpen(true); }}
                  disabled={pending}
                >
                  Fshij
                </button>
              ) : null}
            </>
          )}
        </td>
      </tr>

      {/* The same viewer the public galleries use — ESC / tap-outside close,
          and it is already the one thing on this site that knows how to show a
          photo full-screen on a phone. */}
      <Lightbox
        photos={receiptUrls.map((src, i) => ({
          src,
          alt: receiptCount > 1
            ? `Fatura — ${expense.description} (${i + 1}/${receiptCount})`
            : `Fatura — ${expense.description}`,
        }))}
        openIndex={photoOpen && receiptCount > 0 ? 0 : null}
        onClose={() => setPhotoOpen(false)}
      />

      <ExpenseDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={() => { setDetailOpen(false); setEditOpen(true); }}
        expense={expense}
        options={options}
        canWrite={canWrite}
      />

      <ExpenseFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        options={options}
        expense={expense}
      />

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Shëno si të rimbursuar"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPayOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button type="button" className="btn btn-ember btn-sm" onClick={markReimbursed} disabled={pending}>
              {pending ? "Duke ruajtur…" : "Ruaj rimbursimin"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 14, lineHeight: 1.6 }}>
          <strong>{payer}</strong> i ka dhënë paratë e veta për “{expense.description}” më{" "}
          {formatDate(expense.occurred_on)} ({expenseAmountLabel(expense)}). Pas kësaj, klubi nuk i ka
          më borxh.
        </div>
        <div className="field">
          <label htmlFor={`rn-${expense.id}`}>Si u rimbursua</label>
          <input
            id={`rn-${expense.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="p.sh. i kam rimbursuar me naftë"
          />
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }}>
            Shlyerjet bëhen shpesh në natyrë, prandaj shënimi është i vetmi dokument i tyre.
            Mos e shto shlyerjen edhe si shpenzim të ri — do të numërohej dy herë te daljet.
          </div>
        </div>
        {err ? <div className="mm-msg err">{err}</div> : null}
      </Modal>

      <ConfirmModal
        open={undoOpen}
        onClose={() => setUndoOpen(false)}
        title="Zhbëj rimbursimin"
        tone="danger"
        confirmLabel="Zhbëj"
        message={
          <>
            Ky shpenzim kthehet te borxhet që klubi i ka <strong>{payer}</strong>, dhe shënimi i
            rimbursimit fshihet. Vetë shpenzimi nuk fshihet.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await setReimbursed(expense.id, { reimbursed: false, note: "" });
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Zhbërja e rimbursimit dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />

      <ConfirmModal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Fshij shpenzimin"
        tone="danger"
        confirmLabel="Fshij"
        message={
          <>
            “{expense.description}” ({expenseAmountLabel(expense)} · {formatDate(expense.occurred_on)})
            hiqet përgjithmonë nga regjistri i shpenzimeve. Ky veprim nuk kthehet.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await deleteExpense(expense.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Fshirja e shpenzimit dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />
    </>
  );
}
