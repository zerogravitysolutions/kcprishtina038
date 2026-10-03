"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { FUND_KINDS, FUND_KIND_LABEL } from "@/lib/finance";
import type { ClubFundKind } from "@/lib/supabase/types";
import { createFund, updateFund, type FundInput } from "./actions";

/** One fund as the list renders it — flattened by the page, not embedded. */
export type FundView = {
  id: string;
  title: string;
  occurred_on: string;
  amount_eur: number;
  kind: ClubFundKind;
  reference: string | null;
  notes: string | null;
};

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Create or edit one fund. The fast path the owner asked for is the first three
 * fields — titull, datë, shumë — and everything after them has a sane default,
 * so a donation is four taps and a sponsorship is five.
 */
export function FundDialog({
  open, onClose, fund,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent = create. */
  fund?: FundView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(fund?.title ?? "");
  const [date, setDate] = useState(fund?.occurred_on ?? todayIso());
  const [amount, setAmount] = useState(fund ? String(fund.amount_eur) : "");
  const [kind, setKind] = useState<ClubFundKind>(fund?.kind ?? "sponsor");
  const [reference, setReference] = useState(fund?.reference ?? "");
  const [notes, setNotes] = useState(fund?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!fund;
  const id = fund?.id ?? "new";
  const ready =
    title.trim().length > 0 && date.length > 0 && amount.trim().length > 0;

  function save() {
    setErr(null);
    const input: FundInput = {
      title, occurred_on: date, amount_eur: amount, kind,
      reference, notes,
    };
    start(async () => {
      try {
        const r = fund ? await updateFund(fund.id, input) : await createFund(input);
        if (!r.ok) { setErr(r.error); return; }
        onClose();
        router.refresh();
      } catch (e) {
        const msg = actionError(e, "Ruajtja e hyrjes dështoi. Provo sërish.");
        if (msg) setErr(msg);
        else { onClose(); router.refresh(); }
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Ndrysho hyrjen" : "Shto hyrje"}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            Anulo
          </button>
          <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending || !ready}>
            {pending ? "Duke ruajtur…" : isEdit ? "Ruaj" : "Krijo"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={`t-${id}`}>Titulli</label>
        <input
          id={`t-${id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="p.sh. BikePlus 2026"
          autoComplete="off"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="field">
          <label htmlFor={`d-${id}`}>Data e pranimit</label>
          <input
            id={`d-${id}`}
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`a-${id}`}>Shuma (€)</label>
          <NumericInput
            id={`a-${id}`}
            kind="decimal"
            value={amount}
            onChange={setAmount}
            placeholder="6000"
            ariaLabel="Shuma në euro"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`k-${id}`}>Lloji</label>
        <select id={`k-${id}`} value={kind} onChange={(e) => setKind(e.target.value as ClubFundKind)}>
          {FUND_KINDS.map((k) => <option key={k} value={k}>{FUND_KIND_LABEL[k]}</option>)}
        </select>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          Titulli i hyrjes bëhet burimi që zgjidhet te shpenzimet. Shkruaj edhe vitin, p.sh. BikePlus 2026.
        </div>
      </div>

      <div className="field">
        <label htmlFor={`r-${id}`}>Referenca (opsional)</label>
        <input
          id={`r-${id}`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="p.sh. numri i kontratës ose i transfertës"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor={`n-${id}`}>Shënime (opsional)</label>
        <textarea
          id={`n-${id}`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="p.sh. mbulon pajisjet e sezonit"
        />
      </div>

      {err ? <div className="mm-msg err">{err}</div> : null}
    </Modal>
  );
}

/** The page-head button. Kept here so the dialog state stays client-side. */
export function NewFundButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>
        Shto hyrje
      </button>
      {/* Remounted on each open so a cancelled draft never reappears. */}
      {open ? <FundDialog open onClose={() => setOpen(false)} /> : null}
    </>
  );
}
