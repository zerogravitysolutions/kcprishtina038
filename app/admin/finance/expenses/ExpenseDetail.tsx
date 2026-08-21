"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Lightbox } from "@/components/ui/Lightbox";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_CATEGORY_LABEL,
  UNKNOWN_SPONSOR_LABEL, beneficiaryLabel, expenseAmountLabel, hasAmount, invoiceNoLabel,
  isOwedToMember, paidByLabel,
} from "@/lib/finance";
import { type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
import { dateLabel } from "./labels";
import { receiptPublicUrl } from "./receipt";

/** One labelled fact of the definition list: label above, value under it. */
function Fact({ label, num, children }: { label: string; num?: boolean; children: ReactNode }) {
  return (
    <div className="exd-f">
      <dt className="exd-k">{label}</dt>
      <dd className={`exd-v${num ? " num" : ""}`}>{children}</dd>
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
 * IT READS LIKE A RECEIPT. The answer is at the top and nowhere else: how much
 * it cost, what it was for, and whether it is settled. Under it, three named
 * groups of facts as a two-column definition list that becomes one column on a
 * phone — when/what, who it was for and who paid, how it was paid and its
 * paperwork — then the note, then the proof as a thumbnail row. Both actions
 * (Ndrysho, Fshij) live in the modal footer, never scattered through the body.
 *
 * Every empty value is a WORD from lib/finance — "Pa shumë", "Klubi",
 * "Pa faturë", "Pa burim" — never a dash and never €0.00. A date that cannot be
 * parsed says "Datë e panjohur" (see ./labels) instead of the em dash
 * formatDate() falls back to.
 *
 * "Ndrysho" and "Fshij" hand off to the dialogs the row already owns, so there
 * is one source of truth for editing and one for deleting.
 */
export function ExpenseDetail({
  open, onClose, onEdit, onDelete, expense, options, canWrite, canDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** Switch from viewing to editing — opens the existing ExpenseFormModal. */
  onEdit: () => void;
  /** Switch from viewing to deleting — opens the row's ConfirmModal. */
  onDelete: () => void;
  expense: ExpenseView;
  options: ExpenseOptions;
  /** Read-only users see no "Ndrysho". */
  canWrite: boolean;
  /** Only an admin removes a ledger line, so only an admin sees "Fshij". */
  canDelete: boolean;
}) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Escape belongs to the TOPMOST layer only.
   *
   * Lightbox listens on window and components/ui/Modal listens on document, so
   * with the viewer open above this detail one Escape would close BOTH — the
   * photo and the expense behind it. Capturing at the document, before either
   * bubble listener can run, keeps the key on the viewer: a capture-phase
   * stopPropagation() ends the dispatch, so neither the document bubble
   * listener (Modal) nor the window one (Lightbox) ever sees this event.
   */
  useEffect(() => {
    if (photoIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPhotoIndex(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [photoIndex]);

  /**
   * WHILE THE VIEWER IS UP IT OWNS EVERY "CLOSE" — and not only for tidiness.
   *
   * The lightbox hides the dialog but does not hide it from the TAB key: the
   * buttons under it stay focusable, so a keyboard user can reach "Mbyll",
   * "Ndrysho" or "Fshij" and dismiss the detail while the photo is still on
   * screen. Both layers lock the page: Modal saves body.overflow ("") and sets
   * hidden, then Lightbox saves it ("hidden") and sets hidden. Unmount the
   * MODAL first and the viewer's cleanup runs last, restoring the value it
   * captured — "hidden" — and the ledger behind it can never be scrolled again
   * without a reload. Swallowing the close (and re-firing it as "close the
   * photo") keeps the two locks strictly nested, which is the only order in
   * which save/restore is correct.
   */
  const photoOpen = photoIndex !== null;
  const closeDetail = () => {
    if (photoOpen) { setPhotoIndex(null); return; }
    onClose();
  };
  const editFromDetail = () => { if (!photoOpen) onEdit(); };
  const deleteFromDetail = () => { if (!photoOpen) onDelete(); };

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

  const photos = receiptUrls.map((src, i) => ({
    src,
    alt: receiptUrls.length > 1
      ? `Fatura — ${expense.description} (${i + 1}/${receiptUrls.length})`
      : `Fatura — ${expense.description}`,
  }));

  return (
    <>
      <Modal
        open={open}
        onClose={closeDetail}
        title="Detajet e shpenzimit"
        footer={
          <>
            {canDelete ? (
              <button type="button" className="btn btn-ghost btn-sm exd-del" onClick={deleteFromDetail}>
                Fshij
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeDetail}>
              Mbyll
            </button>
            {canWrite ? (
              <button type="button" className="btn btn-ember btn-sm" onClick={editFromDetail}>
                Ndrysho
              </button>
            ) : null}
          </>
        }
      >
        <div className="exd">
          {/* The answer, before anything else: how much, what for, settled or
              not. Nothing else competes with it at this size. */}
          <header className="exd-hero">
            <div className="exd-hero-top">
              <div className={`exd-amount${priced ? "" : " none"}`}>{expenseAmountLabel(expense)}</div>
              <span className={`badge-st ${EXPENSE_STATUS_TONE[expense.status]}`}>
                {EXPENSE_STATUS_LABEL[expense.status]}
              </span>
            </div>
            <h3 className="exd-title">{expense.description}</h3>
          </header>

          {owed ? (
            <div className="exd-owed">
              Klubi i ka borxh <strong>{payer}</strong> për këtë shpenzim.
            </div>
          ) : null}

          <Group title="Kur dhe çka">
            <dl className="exd-dl">
              <Fact label="Data" num>{dateLabel(expense.occurred_on)}</Fact>
              <Fact label="Kategoria">{expense.category_name?.trim() || UNKNOWN_CATEGORY_LABEL}</Fact>
            </dl>
          </Group>

          <Group title="Për kë dhe nga kush">
            <dl className="exd-dl">
              <Fact label="Për kë">{beneficiaryLabel(expense, nameOf)}</Fact>
              <Fact label="Paguar nga">
                {payer}
                {expense.paid_by === "member" && !owed ? (
                  <span className="exd-vs">rimbursuar{reimbursedNote ? ` · ${reimbursedNote}` : ""}</span>
                ) : null}
              </Fact>
            </dl>
          </Group>

          <Group title="Pagesa dhe dokumenti">
            <dl className="exd-dl">
              <Fact label="Mënyra">{method}</Fact>
              <Fact label="Nr. i faturës" num>{invoiceNoLabel(expense.invoice_no)}</Fact>
              <Fact label="Burimi">{sponsorName ?? "Pa burim"}</Fact>
            </dl>
          </Group>

          {notes ? (
            <Group title="Shënime">
              <div className="exd-note">{notes}</div>
            </Group>
          ) : null}

          <Group title={receiptUrls.length > 1 ? `Fotot e faturës (${receiptUrls.length})` : "Fotoja e faturës"}>
            {receiptUrls.length > 0 ? (
              <div className="exd-shots">
                {receiptUrls.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className="exd-shot"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={
                      receiptUrls.length > 1
                        ? `Shiko foton ${i + 1} nga ${receiptUrls.length} të faturës`
                        : "Shiko foton e faturës"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" decoding="async" />
                    {receiptUrls.length > 1 ? <span className="exd-shot-n" aria-hidden="true">{i + 1}</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="exd-empty">Pa foto të faturës.</div>
            )}
          </Group>
        </div>
      </Modal>

      {/* PORTALLED, AND THE WRAPPER'S z-index IS NOT DECORATION.
          components/ui/Modal's overlay carries backdrop-filter, which makes it
          the CONTAINING BLOCK for every position:fixed descendant — so a
          Lightbox rendered in place here would be laid out against the dialog
          and then clipped by its overflow:hidden panel. Escaping to <body>
          fixes the geometry; the z-index above the Modal's own 9999 fixes the
          stacking, since Lightbox asks for 1000 and would otherwise open
          BEHIND the very detail it was opened from. Same shape as
          components/admin/PhotoCaptureField. */}
      {mounted && photoIndex !== null && photos.length > 0
        ? createPortal(
            <div style={{ position: "relative", zIndex: 10000 }}>
              <Lightbox
                photos={photos}
                openIndex={Math.min(photoIndex, photos.length - 1)}
                onClose={() => setPhotoIndex(null)}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
