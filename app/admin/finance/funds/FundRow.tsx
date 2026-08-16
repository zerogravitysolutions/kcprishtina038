"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import { FUND_KIND_LABEL, formatDate, formatEur } from "@/lib/finance";
import { FundDialog, type FundView, type SponsorOption } from "./FundForm";
import { deleteFund } from "./actions";

export function FundRow({
  fund, sponsors, canDelete,
}: {
  fund: FundView;
  sponsors: SponsorOption[];
  /** Deleting money history is admin-only; staff correct rows by editing them. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending] = useTransition();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        <td className="mono" data-lab="Pranuar më">
          <span>
            {formatDate(fund.occurred_on)}
            <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              data e pranimit
            </small>
          </span>
        </td>
        <td className="num" data-lab="Shuma">{formatEur(fund.amount_eur)}</td>
        <td className="actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEditOpen(true)}
            disabled={pending}
          >
            Ndrysho
          </button>
          {canDelete ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 6 }}
              onClick={() => setDeleteOpen(true)}
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
