"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import { FUND_KIND_LABEL, FUND_STATUS_LABEL, FUND_STATUS_TONE, formatDate, formatEur } from "@/lib/finance";
import { FundDialog, type FundView, type SponsorOption } from "./FundForm";
import { deleteFund, markFundPledged, markFundReceived } from "./actions";

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function FundRow({
  fund, sponsors, canDelete,
}: {
  fund: FundView;
  sponsors: SponsorOption[];
  /** Deleting money history is admin-only; staff correct rows by editing them. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [receiveDate, setReceiveDate] = useState(todayIso());
  const [err, setErr] = useState<string | null>(null);

  const pledged = fund.status === "pledged";

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, close: () => void) {
    setErr(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setErr(r.error); return; }
        close();
        router.refresh();
      } catch (e) {
        // A throw from a Server Action is masked by React in production, so the
        // Albanian text has to come from actionError, never from error.message.
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
          <span>
            {fund.title}
            {fund.reference || fund.notes ? (
              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                {[fund.reference, fund.notes].filter(Boolean).join(" · ")}
              </small>
            ) : null}
          </span>
        </td>
        <td data-lab="Lloji">
          <span>
            {FUND_KIND_LABEL[fund.kind]}
            <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {fund.sponsor_name ?? "Pa sponsor"}
            </small>
          </span>
        </td>
        <td className="mono" data-lab={pledged ? "Pritet" : "Pranuar më"}>
          <span>
            {formatDate(fund.occurred_on)}
            <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {pledged ? "data e pritur" : "data e pranimit"}
            </small>
          </span>
        </td>
        <td className="num" data-lab="Shuma">{formatEur(fund.amount_eur)}</td>
        <td data-lab="Statusi">
          <span>
            <span className={`badge-st ${FUND_STATUS_TONE[fund.status]}`}>{FUND_STATUS_LABEL[fund.status]}</span>
            <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
              {pledged ? "jashtë bilancit" : "në bilanc"}
            </small>
          </span>
        </td>
        <td className="actions">
          {pledged ? (
            <button
              type="button"
              className="btn btn-ember btn-sm"
              onClick={() => { setErr(null); setReceiveDate(todayIso()); setReceiveOpen(true); }}
              disabled={pending}
            >
              Shëno si të pranuar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setErr(null); setPledgeOpen(true); }}
              disabled={pending}
            >
              Kthe në premtim
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 6 }}
            onClick={() => { setErr(null); setEditOpen(true); }}
            disabled={pending}
          >
            Ndrysho
          </button>
          {canDelete ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 6 }}
              onClick={() => { setErr(null); setDeleteOpen(true); }}
              disabled={pending}
            >
              Fshij
            </button>
          ) : null}
        </td>
      </tr>

      {editOpen ? (
        <FundDialog open onClose={() => setEditOpen(false)} fund={fund} sponsors={sponsors} />
      ) : null}

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Shëno si të pranuar"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceiveOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember btn-sm"
              disabled={pending || !receiveDate}
              onClick={() => run(() => markFundReceived(fund.id, receiveDate), () => setReceiveOpen(false))}
            >
              {pending ? "Duke ruajtur…" : "Ruaj"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 14, lineHeight: 1.55 }}>
          <strong>{fund.title}</strong> ({formatEur(fund.amount_eur)}) kalon te paratë e pranuara dhe hyn në
          bilancin e klubit. Shëno ditën kur arritën vërtet — data e premtimit do të zëvendësohet.
        </div>
        <div className="field">
          <label htmlFor={`rd-${fund.id}`}>Data e pranimit</label>
          <input
            id={`rd-${fund.id}`}
            type="date"
            value={receiveDate}
            max={todayIso()}
            onChange={(e) => setReceiveDate(e.target.value)}
          />
        </div>
        {err ? <div className="mm-msg err">{err}</div> : null}
      </Modal>

      <ConfirmModal
        open={pledgeOpen}
        onClose={() => setPledgeOpen(false)}
        title="Kthe në premtim"
        confirmLabel="Kthe në premtim"
        message={
          <>
            <strong>{fund.title}</strong> ({formatEur(fund.amount_eur)}) del nga bilanci dhe shënohet si e
            premtuar. Përdore këtë nëse paratë nuk kanë arritur ende në llogari.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await markFundPledged(fund.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Kthimi në premtim dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Fshij hyrjen"
        tone="danger"
        confirmLabel="Fshij"
        message={
          <>
            <strong>{fund.title}</strong> ({formatEur(fund.amount_eur)}) fshihet përgjithmonë dhe nuk do të
            llogaritet më askund. Nëse ke gabuar vetëm një fushë, mbylle këtë dhe përdor “Ndrysho”.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await deleteFund(fund.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const msg = actionError(e, "Fshirja e hyrjes dështoi. Provo sërish.");
            if (!msg) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />
    </>
  );
}
