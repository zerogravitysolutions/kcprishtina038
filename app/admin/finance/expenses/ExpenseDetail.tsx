"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Lightbox } from "@/components/ui/Lightbox";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_CATEGORY_LABEL,
  UNKNOWN_SPONSOR_LABEL, beneficiaryLabel, expenseAmountLabel, formatDate, hasAmount,
  invoiceNoLabel, isOwedToMember, paidByLabel,
} from "@/lib/finance";
import { type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
import { receiptPublicUrl } from "./receipt";

/** One labelled fact: micro-label on top, value below. Two per line on a phone. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="exd-f">
      <div className="exd-k">{label}</div>
      <div className="exd-v">{children}</div>
    </div>
  );
}

/** A titled block of facts. The title is what makes the modal scannable. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="exd-group">
      <h4 className="exd-h">{title}</h4>
      {children}
    </section>
  );
}

/**
 * Read-only view of ONE expense, opened by tapping its row.
 *
 * The shape follows how the owner reads a cost: the answer first (how much,
 * paid or not, when), then the sentence (what it was, which category), then the
 * paperwork in labelled groups, then the proof as real thumbnails. Every empty
 * value is a WORD from lib/finance — "Pa shumë", "Klubi", "Pa faturë",
 * "Pa burim" — never a dash and never €0.00.
 *
 * "Ndrysho" hands off to the edit form the row already owns (onEdit), so there
 * is one source of truth for editing.
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
  const notes = expense.notes?.trim();
  const priced = hasAmount(expense);

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
        <div className="exd">
          {/* The answer, before anything else: how much, paid or not, when. */}
          <div className="exd-hero">
            <div className="exd-hero-top">
              <div className={`exd-amount${priced ? "" : " none"}`}>{expenseAmountLabel(expense)}</div>
              <span className={`badge-st ${EXPENSE_STATUS_TONE[expense.status]}`}>
                {EXPENSE_STATUS_LABEL[expense.status]}
              </span>
            </div>
            <div className="exd-when mono">{formatDate(expense.occurred_on)}</div>
            <div className="exd-title">{expense.description}</div>
            <span className="exl-cat">{expense.category_name?.trim() || UNKNOWN_CATEGORY_LABEL}</span>
          </div>

          {owed ? (
            <div className="exd-owed">
              Klubi i ka borxh <strong>{payer}</strong> për këtë shpenzim.
            </div>
          ) : null}

          <Group title="Për kë dhe nga kush">
            <div className="exd-grid">
              <Fact label="Për kë">{beneficiaryLabel(expense, nameOf)}</Fact>
              <Fact label="Paguar nga">
                {payer}
                {expense.paid_by === "member" && !owed ? (
                  <span className="exd-vs">rimbursuar{reimbursedNote ? ` · ${reimbursedNote}` : ""}</span>
                ) : null}
              </Fact>
            </div>
          </Group>

          <Group title="Pagesa dhe dokumenti">
            <div className="exd-grid">
              <Fact label="Mënyra">{method}</Fact>
              <Fact label="Nr. i faturës">{invoiceNoLabel(expense.invoice_no)}</Fact>
              <Fact label="Burimi">{sponsorName ?? "Pa burim"}</Fact>
            </div>
          </Group>

          {notes ? (
            <Group title="Shënime">
              <div className="exd-note">{notes}</div>
            </Group>
          ) : null}

          {receiptUrls.length > 0 ? (
            <Group title={receiptUrls.length > 1 ? `Fotot e faturës (${receiptUrls.length})` : "Fotoja e faturës"}>
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
            </Group>
          ) : (
            <Group title="Fotoja e faturës">
              <div className="exd-empty">Pa foto të faturës.</div>
            </Group>
          )}
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
