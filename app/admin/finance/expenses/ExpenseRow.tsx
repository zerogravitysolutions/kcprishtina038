"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Lightbox } from "@/components/ui/Lightbox";
import { actionError } from "@/lib/errors";
import {
  EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, UNKNOWN_SPONSOR_LABEL,
  beneficiaryLabel, expenseAmountLabel, hasAmount, invoiceNoLabel, isOwedToMember,
  paidByLabel,
} from "@/lib/finance";
import { deleteExpense, setReimbursed } from "./actions";
import { ExpenseDetail } from "./ExpenseDetail";
import { ExpenseFormModal, type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
import { dateLabel } from "./labels";
import { receiptPublicUrl } from "./receipt";

/** Width of the actions menu, so it can be flipped away from the right edge. */
const MENU_W = 224;

/**
 * ONE expense, as a row of the .exl list (see the block at the end of
 * app/admin/admin.css). The same markup is a stacked card on a phone and a
 * column layout on a desktop — grid-template-areas moves the cells, nothing is
 * duplicated and nothing is hidden, so a phone never scrolls sideways and a
 * wide screen never reads as a list of half-empty cards.
 *
 * TAP TARGETS. The whole row is one target: `.exl-hit` is a transparent button
 * stretched over the row that opens the read-only detail. The two controls that
 * must NOT open it — the receipt thumbnail and the actions menu — are lifted
 * above it with z-index instead of stopping propagation, so a mis-tap on the
 * padding still lands on "open", which is the thing the owner wants 9 times
 * out of 10.
 */
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

  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // A menu anchored with fixed coordinates has to close when the page moves
  // under it — the same rule the people list follows.
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuPos]);

  function openMenu() {
    const r = menuBtn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setMenuPos({ top: r.bottom + 6, left });
  }

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
  const priced = hasAmount(expense);
  const amount = expenseAmountLabel(expense);
  const when = dateLabel(expense.occurred_on);
  const beneficiary = beneficiaryLabel(expense, nameOf);
  const notes = expense.notes?.trim();

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

  /** Closes the menu first, then runs the thing that opens a dialog. */
  function fromMenu(fn: () => void) {
    setMenuPos(null);
    setErr(null);
    fn();
  }

  return (
    <>
      <div className={`exl-row${owed ? " owed" : ""}`}>
        {/* The one obvious tap target. Its label carries the three facts a
            screen reader needs to tell two rows apart. */}
        <button
          type="button"
          className="exl-hit"
          onClick={() => setDetailOpen(true)}
          aria-label={`Hap detajet: ${expense.description} · ${when} · ${amount}`}
        />

        <div className="exl-date mono" title={when}>{when}</div>

        {/* Money right-aligned and tabular at every width; an unpriced cost says
            so in words instead of showing €0.00. */}
        <div className={`exl-amt${priced ? "" : " none"}`}>{amount}</div>

        <div className="exl-desc">
          <span className="exl-title">{expense.description}</span>
          {expense.invoice_no || sponsorName ? (
            <span className="exl-sub">
              {expense.invoice_no ? invoiceNoLabel(expense.invoice_no) : null}
              {expense.invoice_no && sponsorName ? " · " : null}
              {sponsorName ? `burimi: ${sponsorName}` : null}
            </span>
          ) : null}
          {notes ? <span className="exl-note">{notes}</span> : null}
        </div>

        {/* Category + proof in ONE cell, so a row WITH a photo and a row
            WITHOUT one start their meta line at exactly the same x. This used
            to be two grid areas swapped by a `.has-rc` template, which shunted
            the category pill 54px to the right on every row that had a
            receipt — the indicator jostled the list. From 760px up .exl-meta
            becomes display:contents and the two children go back to being real
            grid items, so the wide layout keeps its RESERVED photo column. */}
        <div className="exl-meta">
          <span className="exl-cat">{expense.category_name}</span>

          {receiptCount > 0 ? (
            <button
              type="button"
              className="exl-rc"
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
              {receiptCount > 1 ? <span className="exl-rc-n" aria-hidden="true">{receiptCount}</span> : null}
            </button>
          ) : null}
        </div>

        <div className="exl-who">
          <span className="exl-k">Për kë</span>
          <span className="exl-v">{beneficiary}</span>
        </div>

        <div className="exl-paid">
          <span className="exl-k">Paguar nga</span>
          <span className="exl-v">{payer}</span>
          {expense.paid_by === "member" ? (
            <span className={`exl-vs${owed ? " owed" : ""}`}>
              {owed ? "klubi ia ka borxh" : "rimbursuar"}
            </span>
          ) : expense.payment_method ? (
            <span className="exl-vs">{EXPENSE_PAYMENT_METHOD_LABEL[expense.payment_method]}</span>
          ) : null}
        </div>

        <div className="exl-st">
          <span className={`badge-st ${EXPENSE_STATUS_TONE[expense.status]}`}>
            {EXPENSE_STATUS_LABEL[expense.status]}
          </span>
        </div>

        {canWrite ? (
          <div className="exl-act">
            <button
              ref={menuBtn}
              type="button"
              className="kebab"
              aria-haspopup="menu"
              aria-expanded={menuPos ? true : false}
              aria-label={`Veprime për “${expense.description}”`}
              onClick={() => (menuPos ? setMenuPos(null) : openMenu())}
              disabled={pending}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {menuPos && mounted && createPortal(
        <>
          <div className="kebab-backdrop" onClick={() => setMenuPos(null)} />
          <div className="kebab-menu" role="menu" style={{ top: menuPos.top, left: menuPos.left }}>
            <button type="button" role="menuitem" onClick={() => fromMenu(() => setDetailOpen(true))}>
              <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.6" />
              </svg>
              Shiko detajet
            </button>
            <button type="button" role="menuitem" onClick={() => fromMenu(() => setEditOpen(true))}>
              <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M14 6l4 4" />
              </svg>
              Ndrysho
            </button>
            {owed ? (
              <button type="button" role="menuitem" onClick={() => fromMenu(() => { setNote(""); setPayOpen(true); })}>
                <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 7H4v10h16V7Z" /><circle cx="12" cy="12" r="2.4" />
                </svg>
                Shëno si të rimbursuar
              </button>
            ) : null}
            {expense.reimbursed ? (
              <button type="button" role="menuitem" onClick={() => fromMenu(() => setUndoOpen(true))}>
                <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 10h10a6 6 0 1 1-6 6" /><path d="M4 10l4-4M4 10l4 4" />
                </svg>
                Zhbëj rimbursimin
              </button>
            ) : null}
            {canDelete ? (
              <>
                <div className="sep" />
                <button type="button" role="menuitem" className="danger" onClick={() => fromMenu(() => setDelOpen(true))}>
                  <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                  </svg>
                  Fshij
                </button>
              </>
            ) : null}
          </div>
        </>,
        document.body,
      )}

      {/* The same viewer the public galleries use — ESC / tap-outside close,
          and it is already the one thing on this site that knows how to show a
          photo full-screen on a phone.

          PORTALLED to <body>, like the one in ExpenseDetail and the one in
          components/admin/PhotoCaptureField. Lightbox is position:fixed at
          z-index 1000, which only means "above the page" while no ancestor
          carries a transform, a filter or a backdrop-filter — any of those
          would make that ancestor the containing block and trap the viewer
          inside the list. The row sits under .exl-rows, which is a clipping
          card from 760px up and a stone's throw from the blurred month
          heading, so the viewer is lifted out of the subtree rather than left
          depending on what the rows around it happen to be styled with. */}
      {mounted && photoOpen && receiptCount > 0 && createPortal(
        <div style={{ position: "relative", zIndex: 10000 }}>
          <Lightbox
            photos={receiptUrls.map((src, i) => ({
              src,
              alt: receiptCount > 1
                ? `Fatura — ${expense.description} (${i + 1}/${receiptCount})`
                : `Fatura — ${expense.description}`,
            }))}
            openIndex={0}
            onClose={() => setPhotoOpen(false)}
          />
        </div>,
        document.body,
      )}

      <ExpenseDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={() => { setDetailOpen(false); setEditOpen(true); }}
        onDelete={() => { setDetailOpen(false); setDelOpen(true); }}
        expense={expense}
        options={options}
        canWrite={canWrite}
        canDelete={canDelete}
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
          {when} ({amount}). Pas kësaj, klubi nuk i ka më borxh.
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
            “{expense.description}” ({amount} · {when}) hiqet përgjithmonë nga regjistri i
            shpenzimeve. Ky veprim nuk kthehet.
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
