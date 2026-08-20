"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Lightbox } from "@/components/ui/Lightbox";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_CATEGORY_LABEL,
  UNKNOWN_SPONSOR_LABEL, beneficiaryLabel, expenseAmountLabel, formatDate, invoiceNoLabel,
  isOwedToMember, paidByLabel,
} from "@/lib/finance";
import { type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
import { receiptPublicUrl } from "./receipt";

/** One labelled field: label on top, value below — reads top-down on a phone. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="exp-dl-row">
      <div className="exp-dl-k">{label}</div>
      <div className="exp-dl-v">{children}</div>
    </div>
  );
}

/**
 * Read-only view of one expense — every field laid out as a single-column list
 * of labelled rows, grouped. This is the tap target from the list; "Ndrysho"
 * hands off to the edit form the row already owns (onEdit), so there is one
 * source of truth for editing.
 */
export function ExpenseDetail({
  open, onClose, onEdit, expense, options, canWrite,
}: {
  open: boolean;
  onClose: () => void;
  /** Switch from viewing to editing — opens the existing ExpenseFormModal. */
  onEdit: () => void;
  expense: ExpenseView;
  options: ExpenseOptions;
  /** Read-only users see no "Ndrysho". */
  canWrite: boolean;
}) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  const nameOf = (id: string) => options.members.find((m) => m.id === id)?.full_name ?? null;

  // A cost charged to a sponsor whose row is gone still says it is charged to
  // somebody; a null sponsor is genuinely "no source", a different sentence.
  const sponsorName = expense.funding_sponsor_id
    ? options.sponsors.find((s) => s.id === expense.funding_sponsor_id)?.name ?? UNKNOWN_SPONSOR_LABEL
    : null;

  const owed = isOwedToMember(expense);
  const payer = paidByLabel(expense, nameOf);
  const method = expense.payment_method ? EXPENSE_PAYMENT_METHOD_LABEL[expense.payment_method] : "E pashënuar";
  const reimbursedNote = expense.reimbursed_note?.trim();

  const receiptUrls = expense.receipt_paths
    .map((p) => receiptPublicUrl(p))
    .filter((u): u is string => !!u);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Detajet e shpenzimit"
        footer={
          <>
            {canWrite ? (
              <button type="button" className="btn btn-ember btn-sm" onClick={onEdit}>
                Ndrysho
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Mbyll
            </button>
          </>
        }
      >
        <div className="exp-detail">
          <section className="exp-dl-group">
            <div className="kicker">Kryesore</div>
            <DetailRow label="Data">
              <span className="mono">{formatDate(expense.occurred_on)}</span>
            </DetailRow>
            <DetailRow label="Kategoria">{expense.category_name?.trim() || UNKNOWN_CATEGORY_LABEL}</DetailRow>
            <DetailRow label="Përshkrimi">{expense.description}</DetailRow>
            <DetailRow label="Shuma">
              <span className="mono">{expenseAmountLabel(expense)}</span>
            </DetailRow>
          </section>

          <section className="exp-dl-group">
            <div className="kicker">Për kë &amp; pagesa</div>
            <DetailRow label="Për kë">{beneficiaryLabel(expense, nameOf)}</DetailRow>
            <DetailRow label="Paguar nga">
              <div>{payer}</div>
              {expense.paid_by === "member" ? (
                owed ? (
                  <div className="exp-dl-owed">Klubi i ka borxh këtij personi</div>
                ) : (
                  <div className="exp-dl-sub">
                    Rimbursuar{reimbursedNote ? ` · ${reimbursedNote}` : ""}
                  </div>
                )
              ) : null}
            </DetailRow>
            <DetailRow label="Mënyra">{method}</DetailRow>
            <DetailRow label="Nr. i faturës">{invoiceNoLabel(expense.invoice_no)}</DetailRow>
            <DetailRow label="Burimi">{sponsorName ?? "Pa burim"}</DetailRow>
          </section>

          <section className="exp-dl-group">
            <div className="kicker">Statusi</div>
            <DetailRow label="Statusi">
              <span className={`badge-st ${EXPENSE_STATUS_TONE[expense.status]}`}>
                {EXPENSE_STATUS_LABEL[expense.status]}
              </span>
            </DetailRow>
          </section>

          {expense.notes?.trim() ? (
            <section className="exp-dl-group">
              <div className="kicker">Shënime</div>
              <div className="exp-dl-note">{expense.notes}</div>
            </section>
          ) : null}

          {receiptUrls.length > 0 ? (
            <section className="exp-dl-group">
              <div className="kicker">Fotot e faturës</div>
              <div className="exp-rc-grid">
                {receiptUrls.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className="exp-rc-thumb"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={
                      receiptUrls.length > 1
                        ? `Shiko foton ${i + 1} nga ${receiptUrls.length} të faturës`
                        : "Shiko foton e faturës"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Modal>

      <Lightbox
        photos={receiptUrls.map((src, i) => ({
          src,
          alt: receiptUrls.length > 1
            ? `Fatura — ${expense.description} (${i + 1}/${receiptUrls.length})`
            : `Fatura — ${expense.description}`,
        }))}
        openIndex={photoIndex}
        onClose={() => setPhotoIndex(null)}
      />
    </>
  );
}
