"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_SPONSOR_LABEL,
  beneficiaryLabel, expenseAmountLabel, formatDate, invoiceNoLabel, isOwedToMember, paidByLabel,
} from "@/lib/finance";
import { deleteExpense, setReimbursed } from "./actions";
import { ExpenseFormModal, type ExpenseOptions, type ExpenseView } from "./ExpenseForm";

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

  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
        <td className="mono" data-lab="Data">{formatDate(expense.occurred_on)}</td>

        <td>
          <span>
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
          </span>
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
