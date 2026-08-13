"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { FUND_KINDS, FUND_KIND_LABEL, FUND_STATUS_LABEL, formatEur } from "@/lib/finance";
import type { ClubFundKind, ClubFundStatus } from "@/lib/supabase/types";
import { createFund, updateFund, type FundInput } from "./actions";

/** One fund as the list renders it — flattened by the page, not embedded. */
export type FundView = {
  id: string;
  title: string;
  occurred_on: string;
  amount_eur: number;
  kind: ClubFundKind;
  sponsor_id: string | null;
  status: ClubFundStatus;
  reference: string | null;
  notes: string | null;
  /** Resolved on the server; null when the fund names no sponsor. */
  sponsor_name: string | null;
};

export type SponsorOption = { id: string; name: string; active: boolean };

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The typed amount as a number, or null when it is not one yet. Deliberately
 * as strict as the server (see parseAmount in actions.ts): Number("6.000")
 * would say 6 and Number("") would say 0, and a preview that lies is worse
 * than no preview.
 */
function amountPreview(raw: string): number | null {
  const s = raw.trim().replace(/,/g, ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The two states of club money, as a pair of buttons rather than a dropdown.
 * The whole point of club_funds.status is that a pledge is NOT cash, and a
 * value hidden inside a closed select is the easiest thing in a form to leave
 * on its default and never read.
 */
function StatusPicker({
  value, onChange, disabled,
}: { value: ClubFundStatus; onChange: (v: ClubFundStatus) => void; disabled?: boolean }) {
  const options: Array<{ v: ClubFundStatus; note: string }> = [
    { v: "received", note: "Në llogari" },
    { v: "pledged", note: "Ende jo në llogari" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(o.v)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: disabled ? "default" : "pointer",
              border: `1px solid ${on ? (o.v === "received" ? "var(--ok)" : "var(--warn)") : "var(--line-strong)"}`,
              background: on
                ? o.v === "received" ? "var(--ok-bg)" : "var(--warn-bg)"
                : "var(--surface-1)",
              color: on ? (o.v === "received" ? "var(--ok)" : "var(--warn)") : "var(--text-2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{FUND_STATUS_LABEL[o.v]}</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".04em", marginTop: 2, opacity: 0.9 }}>
              {o.note}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Create or edit one fund. The fast path the owner asked for is the first three
 * fields — titull, datë, shumë — and everything after them has a sane default,
 * so a donation is four taps and a sponsorship is five.
 */
export function FundDialog({
  open, onClose, fund, sponsors,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent = create. */
  fund?: FundView;
  sponsors: SponsorOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // A club with no sponsors on file cannot save kind='sponsor' (the CHECK needs
  // a sponsor_id), so the default falls back to a kind that is always valid.
  const defaultKind: ClubFundKind = sponsors.length > 0 ? "sponsor" : "other";

  const [title, setTitle] = useState(fund?.title ?? "");
  const [date, setDate] = useState(fund?.occurred_on ?? todayIso());
  const [amount, setAmount] = useState(fund ? String(fund.amount_eur) : "");
  const [status, setStatus] = useState<ClubFundStatus>(fund?.status ?? "received");
  const [kind, setKind] = useState<ClubFundKind>(fund?.kind ?? defaultKind);
  const [sponsorId, setSponsorId] = useState(fund?.sponsor_id ?? "");
  const [reference, setReference] = useState(fund?.reference ?? "");
  const [notes, setNotes] = useState(fund?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!fund;
  const id = fund?.id ?? "new";
  // Sponsors that were retired stay selectable on the row that already names
  // them, so editing an old fund cannot silently drop its sponsor.
  const sponsorChoices = sponsors.filter((s) => s.active || s.id === fund?.sponsor_id);
  const needsSponsor = kind === "sponsor";
  // The typed amount, or null while it is not yet a number. The server parses
  // it again — this is only for the sentence under the form.
  const preview = amountPreview(amount);
  const ready =
    title.trim().length > 0 && date.length > 0 && amount.trim().length > 0 && (!needsSponsor || !!sponsorId);

  function save() {
    setErr(null);
    const input: FundInput = {
      title, occurred_on: date, amount_eur: amount, kind,
      sponsor_id: sponsorId, status, reference, notes,
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
          placeholder="p.sh. Sponsorizim Novus 2026"
          autoComplete="off"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label htmlFor={`d-${id}`}>{status === "received" ? "Data e pranimit" : "Data e pritur"}</label>
          <input
            id={`d-${id}`}
            type="date"
            value={date}
            max={status === "received" ? todayIso() : undefined}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`a-${id}`}>Shuma (€)</label>
          <NumericInput
            kind="decimal"
            value={amount}
            onChange={setAmount}
            placeholder="6000"
            ariaLabel="Shuma në euro"
          />
        </div>
      </div>

      <div className="field">
        <label>Statusi</label>
        <StatusPicker value={status} onChange={setStatus} disabled={pending} />
        <div className="mono" style={{ fontSize: 10.5, color: status === "pledged" ? "var(--warn)" : "var(--text-3)", lineHeight: 1.5 }}>
          {status === "pledged"
            ? "Paratë e premtuara nuk hyjnë në bilanc derisa të arrijnë në llogari."
            : "Paratë e pranuara llogariten si të hyra në bilancin e klubit."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label htmlFor={`k-${id}`}>Lloji</label>
          <select id={`k-${id}`} value={kind} onChange={(e) => setKind(e.target.value as ClubFundKind)}>
            {FUND_KINDS.map((k) => <option key={k} value={k}>{FUND_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`s-${id}`}>Sponsori{needsSponsor ? "" : " (opsional)"}</label>
          <select id={`s-${id}`} value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
            <option value="">— Pa sponsor —</option>
            {sponsorChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {needsSponsor && sponsorChoices.length === 0 ? (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--err)", lineHeight: 1.5 }}>
              Nuk ka asnjë sponsor të regjistruar. Shtoje së pari te Sponsorët, ose zgjidh një lloj tjetër.
            </div>
          ) : needsSponsor ? (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.5 }}>
              Një sponsorizim duhet ta thotë sponsorin — pa të nuk llogaritet te buxheti i tij.
            </div>
          ) : null}
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

      {/* Only shown once the typed amount really parses: "€0.00" under a
          half-typed figure would read as a pledge of nothing. */}
      {status === "pledged" && preview != null ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--warn)" }}>
          {formatEur(preview)} të premtuara — jashtë bilancit derisa të arrijnë.
        </div>
      ) : null}

      {err ? <div className="mm-msg err">{err}</div> : null}
    </Modal>
  );
}

/** The page-head button. Kept here so the dialog state stays client-side. */
export function NewFundButton({ sponsors }: { sponsors: SponsorOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>
        Shto hyrje
      </button>
      {/* Remounted on each open so a cancelled draft never reappears. */}
      {open ? <FundDialog open onClose={() => setOpen(false)} sponsors={sponsors} /> : null}
    </>
  );
}
