"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { NumericInput } from "@/components/admin/NumericInput";
import { PhotoCaptureField } from "@/components/admin/PhotoCaptureField";
import { actionError } from "@/lib/errors";
import {
  EXPENSE_PAYMENT_METHODS, EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_STATUS_LABEL, formatEur,
} from "@/lib/finance";
import { parseStrictNumber } from "@/lib/training";
import type { ExpensePaidBy, ExpensePaymentMethod, ExpenseStatus } from "@/lib/supabase/types";
import { createExpense, discardReceipt, updateExpense, uploadReceipt, type ExpenseInput } from "./actions";
import {
  RECEIPT_ALLOWED_MIME, RECEIPT_MAX_BYTES, RECEIPT_MAX_COUNT, RECEIPT_MAX_EDGE,
  RECEIPT_TARGET_BYTES, receiptPublicUrl,
} from "./receipt";

// ------------------------------------------------------------------ types

/** One club_expenses row, flattened by the page — never embedded joins. */
export type ExpenseView = {
  id: string;
  occurred_on: string;
  category_id: string;
  category_name: string;
  description: string;
  /** numeric arrives from PostgREST as a string; null means "no price yet". */
  amount_eur: number | string | null;
  beneficiary_member_id: string | null;
  invoice_no: string | null;
  payment_method: ExpensePaymentMethod | null;
  paid_by: ExpensePaidBy;
  paid_by_member_id: string | null;
  funding_sponsor_id: string | null;
  status: ExpenseStatus;
  reimbursed: boolean;
  reimbursed_note: string | null;
  notes: string | null;
  /** Paths of the receipt photos in the `media` bucket; empty = no photo. */
  receipt_paths: string[];
};

export type CategoryOption = { id: string; name_sq: string; active: boolean };
export type MemberOption = { id: string; full_name: string; active: boolean };
export type SponsorOption = { id: string; name: string; active: boolean };

export type ExpenseOptions = {
  categories: CategoryOption[];
  members: MemberOption[];
  sponsors: SponsorOption[];
};

// ------------------------------------------------------------------ helpers

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * "Paguar nga" is ONE select whose value is either the club or a person. That
 * is not cosmetic: club_expenses_paid_by_ck requires paid_by and
 * paid_by_member_id to agree in both directions, and two independent controls
 * would let the user build the contradiction in the first place.
 */
const CLUB = "club";

type FormState = {
  date: string;
  categoryId: string;
  description: string;
  amount: string;
  beneficiary: string;
  invoiceNo: string;
  method: ExpensePaymentMethod | "";
  payer: string;
  sponsor: string;
  status: ExpenseStatus;
  reimbursed: boolean;
  reimbursedNote: string;
  notes: string;
  receiptPaths: string[];
};

function blankState(categories: CategoryOption[]): FormState {
  const firstActive = categories.find((c) => c.active);
  return {
    date: todayIso(),
    categoryId: firstActive?.id ?? "",
    description: "",
    amount: "",
    beneficiary: "",
    invoiceNo: "",
    method: "cash",
    payer: CLUB,
    sponsor: "",
    status: "paid",
    reimbursed: false,
    reimbursedNote: "",
    notes: "",
    receiptPaths: [],
  };
}

function stateOf(e: ExpenseView): FormState {
  return {
    date: e.occurred_on,
    categoryId: e.category_id,
    description: e.description,
    amount: e.amount_eur === null || e.amount_eur === undefined ? "" : String(e.amount_eur),
    beneficiary: e.beneficiary_member_id ?? "",
    invoiceNo: e.invoice_no ?? "",
    method: e.payment_method ?? "",
    payer: e.paid_by === "member" && e.paid_by_member_id ? e.paid_by_member_id : CLUB,
    sponsor: e.funding_sponsor_id ?? "",
    status: e.status,
    reimbursed: e.reimbursed,
    reimbursedNote: e.reimbursed_note ?? "",
    notes: e.notes ?? "",
    receiptPaths: e.receipt_paths ?? [],
  };
}

function toInput(s: FormState): ExpenseInput {
  const payerIsMember = s.payer !== CLUB && s.payer !== "";
  return {
    occurred_on: s.date,
    category_id: s.categoryId,
    description: s.description,
    amount_eur: s.amount,
    beneficiary_member_id: s.beneficiary || null,
    invoice_no: s.invoiceNo,
    payment_method: s.method,
    paid_by: payerIsMember ? "member" : "club",
    paid_by_member_id: payerIsMember ? s.payer : null,
    funding_sponsor_id: s.sponsor || null,
    status: s.status,
    reimbursed: payerIsMember ? s.reimbursed : false,
    reimbursed_note: s.reimbursedNote,
    notes: s.notes,
    receipt_paths: s.receiptPaths,
  };
}

/**
 * The same three CHECK constraints, checked while the user types so the save
 * button can explain itself instead of failing. The server repeats all of it —
 * this is the courtesy, not the guarantee.
 */
function problemOf(s: FormState): string | null {
  if (!s.date) return "Data e shpenzimit mungon.";
  if (!s.categoryId) return "Zgjidh një kategori për shpenzimin.";
  if (!s.description.trim()) return "Shkruaj se për çfarë është ky shpenzim.";
  if (s.amount.trim() && parseStrictNumber(s.amount) === null) {
    return "Shuma duhet të jetë numër, p.sh. 40 ose 40,5. Lëre bosh nëse çmimi nuk është caktuar ende.";
  }
  if (s.amount.trim() && (parseStrictNumber(s.amount) ?? 0) < 0) {
    return "Shuma nuk mund të jetë negative.";
  }
  // club_expenses_unpaid_no_payer_ck
  if (s.status === "unpaid" && s.payer !== CLUB) {
    return "Një shpenzim i papaguar nuk mund të ketë pagues individual — askush nuk i ka dhënë ende paratë.";
  }
  return null;
}

function memberName(members: MemberOption[], id: string | null): string | null {
  if (!id) return null;
  return members.find((m) => m.id === id)?.full_name ?? null;
}

/** Active people first, past members below, so the common case is one tap. */
function MemberOptions({ members }: { members: MemberOption[] }) {
  const active = members.filter((m) => m.active);
  const past = members.filter((m) => !m.active);
  return (
    <>
      {active.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      {past.length > 0 ? (
        <optgroup label="Të mëparshëm">
          {past.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </optgroup>
      ) : null}
    </>
  );
}

const labelInline: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, textTransform: "none",
  letterSpacing: 0, fontSize: 13, fontFamily: "var(--font-body)", color: "var(--text-2)",
};

// ------------------------------------------------------------------ modal

export function ExpenseFormModal({
  open, onClose, options, expense,
}: {
  open: boolean;
  onClose: () => void;
  options: ExpenseOptions;
  /** Absent = a new expense. */
  expense?: ExpenseView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<FormState>(() => (expense ? stateOf(expense) : blankState(options.categories)));
  const [err, setErr] = useState<string | null>(null);

  /**
   * Receipt photos this session uploaded but nothing has saved yet.
   *
   * Each photo goes into the bucket the moment it is taken — that is what makes
   * the thumbnail appear while the amount is still being typed — so between
   * that upload and the save there is an object no row points at. Cancel the
   * form, or detach a photo before saving, and those objects would sit in the
   * bucket forever. This set is the ledger of what still has to be swept, and
   * it is emptied on save (the survivors are now referenced) or on close.
   */
  const orphans = useRef<Set<string>>(new Set());

  function releaseOrphans(keep: string[]) {
    const kept = new Set(keep);
    const doomed = [...orphans.current].filter((p) => !kept.has(p));
    orphans.current.clear();
    // Fire-and-forget: a sweep that fails costs a stray file, and must never
    // block closing the form or hold up the router refresh.
    for (const p of doomed) void discardReceipt(p).catch(() => {});
  }

  function close() {
    releaseOrphans([]);
    onClose();
  }

  // Reopening the modal must show the row as it is NOW, not as it was when the
  // list was first rendered.
  useEffect(() => {
    if (!open) return;
    setS(expense ? stateOf(expense) : blankState(options.categories));
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  async function handleReceiptAdd(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await uploadReceipt(fd);
      if (!r.ok) return r;
      // The object is now in the bucket but no row points at it yet, so it is an
      // orphan until "Ruaj" makes the reference real.
      orphans.current.add(r.path);
      setS((prev) =>
        prev.receiptPaths.includes(r.path) || prev.receiptPaths.length >= RECEIPT_MAX_COUNT
          ? prev
          : { ...prev, receiptPaths: [...prev.receiptPaths, r.path] });
      return r;
    } catch (e) {
      return {
        ok: false as const,
        error: actionError(e, "Ngarkimi i fotos dështoi. Provo sërish.")
          ?? "Ngarkimi i fotos dështoi. Provo sërish.",
      };
    }
  }

  async function handleReceiptRemove(path: string) {
    set("receiptPaths", s.receiptPaths.filter((p) => p !== path));
    // Only a photo THIS session uploaded is deleted now. One that is already
    // on the saved row stays in the bucket until "Ruaj" makes the detachment
    // real — otherwise pressing "Hiq" and then "Anulo" would have thrown away a
    // receipt the expense still displays.
    if (orphans.current.has(path)) {
      orphans.current.delete(path);
      try { await discardReceipt(path); } catch { /* swept-file failure, not the user's problem */ }
    }
    return { ok: true as const };
  }

  const payerIsMember = s.payer !== CLUB && s.payer !== "";
  const payerName = memberName(options.members, payerIsMember ? s.payer : null);
  const amountNumber = s.amount.trim() ? parseStrictNumber(s.amount) : null;
  const problem = problemOf(s);
  const isEdit = !!expense;

  // A category the row already uses but which has since been retired still has
  // to appear, or editing anything else would silently re-file the expense.
  const categories = options.categories.filter((c) => c.active || c.id === s.categoryId);

  function save() {
    setErr(null);
    if (problem) { setErr(problem); return; }
    start(async () => {
      try {
        const r = expense
          ? await updateExpense(expense.id, toInput(s))
          : await createExpense(toInput(s));
        if (!r.ok) { setErr(r.error); return; }
        // The photos on the row are referenced now; anything else this session
        // uploaded is not, and goes.
        releaseOrphans(s.receiptPaths);
        onClose();
        router.refresh();
      } catch (e) {
        const msg = actionError(e, "Ruajtja e shpenzimit dështoi. Provo sërish.");
        if (msg) setErr(msg);
        else { releaseOrphans(s.receiptPaths); onClose(); router.refresh(); }
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? "Ndrysho shpenzimin" : "Shto shpenzim"}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close} disabled={pending}>
            Anulo
          </button>
          <button
            type="button"
            className="btn btn-ember btn-sm"
            onClick={save}
            disabled={pending || !!problem}
            title={problem ?? undefined}
          >
            {pending ? "Duke ruajtur…" : isEdit ? "Ruaj ndryshimet" : "Ruaj shpenzimin"}
          </button>
        </>
      }
    >
      {/* ---- fast path: what gets typed in the shop ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ex-date">Data</label>
          <input id="ex-date" type="date" value={s.date} onChange={(e) => set("date", e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ex-amount">Shuma (€)</label>
          <NumericInput
            id="ex-amount"
            kind="decimal"
            value={s.amount}
            onChange={(v) => set("amount", v)}
            placeholder="p.sh. 40,5"
            ariaLabel="Shuma në euro"
            hint={s.amount.trim() ? undefined : "Lëre bosh nëse çmimi s’është caktuar ende"}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="ex-cat">Kategoria</label>
        <select id="ex-cat" value={s.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
          <option value="">Zgjidh kategorinë…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_sq}{c.active ? "" : " (joaktive)"}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ex-desc">Përshkrimi</label>
        <input
          id="ex-desc"
          value={s.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="p.sh. goma të reja për garën e Prizrenit"
        />
      </div>

      {/* Directly under the description, still inside the fast path: the slip
          is in the owner's hand at exactly this moment, and a receipt filed
          later is a receipt lost. */}
      <PhotoCaptureField
        label="Fotot e faturës"
        hint="Deri në 3 foto. Secila zvogëlohet në telefon para se të ngarkohet, prandaj nuk harxhon internet."
        alt={`Fatura — ${s.description || "shpenzim"}`}
        paths={s.receiptPaths}
        max={RECEIPT_MAX_COUNT}
        previewUrlOf={receiptPublicUrl}
        onAdd={handleReceiptAdd}
        onRemove={handleReceiptRemove}
        disabled={pending}
        hardMaxBytes={RECEIPT_MAX_BYTES}
        targetBytes={RECEIPT_TARGET_BYTES}
        maxEdge={RECEIPT_MAX_EDGE}
        allowedMime={RECEIPT_ALLOWED_MIME}
      />

      <div className="field">
        <label htmlFor="ex-benef">Për kë (ciklisti)</label>
        <select id="ex-benef" value={s.beneficiary} onChange={(e) => set("beneficiary", e.target.value)}>
          <option value="">Klubi</option>
          <MemberOptions members={options.members} />
        </select>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          Lëre te “Klubi” nëse shpenzimi nuk është për një person të caktuar.
        </div>
      </div>

      {/* ---- who paid: the one that carries a debt ---- */}
      <div className="field">
        <label htmlFor="ex-payer">Paguar nga</label>
        <select
          id="ex-payer"
          value={s.payer}
          onChange={(e) => {
            const v = e.target.value;
            // Switching back to the club drops the reimbursement with it:
            // club_expenses_reimbursed_ck, made unreachable instead of caught.
            setS((prev) => ({
              ...prev,
              payer: v,
              reimbursed: v === CLUB ? false : prev.reimbursed,
              reimbursedNote: v === CLUB ? "" : prev.reimbursedNote,
            }));
          }}
        >
          <option value={CLUB}>Klubi</option>
          <MemberOptions members={options.members} />
        </select>
        {s.status === "unpaid" && payerIsMember ? (
          <div className="mm-msg err" style={{ marginTop: 4 }}>
            Një shpenzim i papaguar nuk mund të ketë pagues individual — askush nuk i ka dhënë ende
            paratë.{" "}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 6 }}
              onClick={() => setS((p) => ({ ...p, payer: CLUB, reimbursed: false, reimbursedNote: "" }))}
            >
              Vendos “Klubi”
            </button>
          </div>
        ) : null}
      </div>

      {payerIsMember ? (
        <div
          style={{
            border: "1px solid color-mix(in oklab, var(--warn) 30%, transparent)",
            background: "var(--warn-bg)",
            borderRadius: "var(--r-sm)",
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.6 }}>
            {s.reimbursed ? (
              <>Klubi ia ka kthyer <strong>{payerName ?? "këtij personi"}</strong> këto para.</>
            ) : (
              <>
                Klubi ia ka borxh <strong>{payerName ?? "këtij personi"}</strong>
                {amountNumber !== null ? <> {formatEur(amountNumber)}</> : " këtë shpenzim (pa shumë të caktuar)"}
                , derisa të shënohet si i rimbursuar.
              </>
            )}
          </div>
          <div className="field" style={{ marginTop: 10, marginBottom: s.reimbursed ? 14 : 0 }}>
            <label style={labelInline}>
              <input
                type="checkbox"
                checked={s.reimbursed}
                onChange={(e) => set("reimbursed", e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Është rimbursuar
            </label>
          </div>
          {s.reimbursed ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ex-rnote">Si u rimbursua</label>
              <input
                id="ex-rnote"
                value={s.reimbursedNote}
                onChange={(e) => set("reimbursedNote", e.target.value)}
                placeholder="p.sh. i kam rimbursuar me naftë"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---- secondary group: always visible, just clearly secondary ----
          These four used to hide behind a "Detajet" toggle, which meant the
          status — the field that decides whether the cost is in the balance at
          all — was one tap away from being forgotten. They stay below the fast
          path and under their own heading, so the form still reads top-down on
          a phone, but nothing is hidden. */}
      <div
        style={{
          borderTop: "1px solid var(--line-strong)",
          paddingTop: 14,
          marginTop: 4,
        }}
      >
        <div className="kicker" style={{ marginBottom: 12 }}>Detajet</div>

        <div className="field">
          <label htmlFor="ex-status">Statusi</label>
          <select
            id="ex-status"
            value={s.status}
            onChange={(e) => set("status", e.target.value as ExpenseStatus)}
          >
            <option value="paid">{EXPENSE_STATUS_LABEL.paid}</option>
            <option value="unpaid">{EXPENSE_STATUS_LABEL.unpaid}</option>
          </select>
          {s.status === "unpaid" ? (
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              Kosto e regjistruar që s’është shlyer ende. Nuk hyn në bilanc derisa të paguhet.
            </div>
          ) : null}
        </div>

        {/* auto-fit, not a hard 1fr 1fr: on a narrow phone these two drop onto
            separate lines instead of squeezing the amounts. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ex-method">Mënyra e pagesës</label>
            <select
              id="ex-method"
              value={s.method}
              onChange={(e) => set("method", e.target.value as ExpensePaymentMethod | "")}
            >
              <option value="">E pashënuar</option>
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{EXPENSE_PAYMENT_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ex-inv">Nr. i faturës</label>
            <input
              id="ex-inv"
              value={s.invoiceNo}
              onChange={(e) => set("invoiceNo", e.target.value)}
              placeholder="Pa faturë"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="ex-sponsor">Burimi (buxheti i sponsorit)</label>
          <select id="ex-sponsor" value={s.sponsor} onChange={(e) => set("sponsor", e.target.value)}>
            <option value="">Pa burim të caktuar</option>
            {options.sponsors.filter((sp) => sp.active || sp.id === s.sponsor).map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}{sp.active ? "" : " (joaktiv)"}
              </option>
            ))}
          </select>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            Zgjidhe edhe nëse sponsori nuk i ka transferuar ende paratë.
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ex-notes">Shënim</label>
          <textarea
            id="ex-notes"
            rows={2}
            value={s.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Çdo gjë që duhet mbajtur mend për këtë shpenzim"
          />
        </div>
      </div>

      {err ? <div className="mm-msg err" style={{ marginTop: 14 }}>{err}</div> : null}
    </Modal>
  );
}

// ------------------------------------------------------------------ trigger

export function NewExpenseButton({ options }: { options: ExpenseOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>
        Shto shpenzim
      </button>
      <ExpenseFormModal open={open} onClose={() => setOpen(false)} options={options} />
    </>
  );
}
