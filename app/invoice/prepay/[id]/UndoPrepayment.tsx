"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { actionError } from "@/lib/errors";
import { undoPrepayment } from "@/app/admin/finance/prepayActions";

type Line = { invoice_no: string | null; month: string };

/** "1 faturë" / "3 fatura". */
function invoiceCount(n: number): string {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

function lines(list: Line[]): string {
  return list.map((l) => `${l.invoice_no?.trim() || "pa numër"} (${l.month})`).join(", ");
}

/**
 * "Anulo parapagimin" — shown to an ADMIN on the prepayment document only.
 * The confirmation says exactly what undo_prepayment does, invoice by invoice:
 * the ones the prepayment created are deleted, the ones that existed before go
 * back to their previous state (unpaid). The action re-checks the admin role
 * and status; hiding this for everyone else is only tidiness.
 */
export function UndoPrepayment({
  id, memberName, rangeLabel, total, paidOn, created, restored, backHref,
}: {
  id: string;
  memberName: string;
  rangeLabel: string;
  /** Already formatted, e.g. "€120.00". */
  total: string;
  /** Already formatted, e.g. "13.9.2026". */
  paidOn: string;
  created: Line[];
  restored: Line[];
  /** Where to land once the prepayment (and this page) no longer exists. */
  backHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <section className="inv-block no-print">
      <span className="inv-lab">Vetëm për administratorin</span>
      <p>
        Nëse ky parapagim u regjistrua gabim, anuloje të tërin: faturat e tij kthehen saktësisht si ishin para tij.
      </p>
      <button
        type="button"
        className="inv-print"
        style={{ background: "#b42318", minHeight: 44, marginTop: 10 }}
        onClick={() => setOpen(true)}
      >
        Anulo parapagimin
      </button>

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Anulo parapagimin"
        tone="danger"
        confirmLabel="Anulo parapagimin"
        cancelLabel="Mbyll"
        message={
          <>
            <p style={{ margin: "0 0 10px" }}>
              Parapagimi i <strong>{memberName}</strong> për {rangeLabel} (<strong className="mono">{total}</strong>,
              paguar më {paidOn}) anulohet i tëri:
            </p>
            {created.length > 0 ? (
              <p style={{ margin: "0 0 10px" }}>
                <strong>{invoiceCount(created.length)} të krijuara nga ky parapagim fshihen përfundimisht:</strong>{" "}
                <span className="mono">{lines(created)}</span>. Numrat e tyre nuk ripërdoren kurrë; muajt lirohen dhe
                mund të faturohen sërish — me dorë, ose nga gjenerimi automatik nëse dita e tyre ende nuk ka kaluar.
              </p>
            ) : null}
            {restored.length > 0 ? (
              <p style={{ margin: "0 0 10px" }}>
                <strong>
                  {restored.length === 1
                    ? "1 faturë që ekzistonte para parapagimit kthehet"
                    : `${restored.length} fatura që ekzistonin para parapagimit kthehen`}{" "}
                  në gjendjen e mëparshme — e papaguar, me shumën që kishte:
                </strong>{" "}
                <span className="mono">{lines(restored)}</span>.
              </p>
            ) : null}
            <p style={{ margin: 0 }}>
              Pagesa prej {total} hiqet nga arkëtimet. Anulimi shënohet në ditarin e veprimeve me emrin tënd dhe
              me të gjitha të dhënat e faturave. Nuk kthehet dot.
            </p>
          </>
        }
        onConfirm={async () => {
          try {
            const r = await undoPrepayment(id);
            if (!r.ok) return { ok: false as const, error: r.error };
            // This document no longer exists: go to the month it started in.
            router.replace(backHref);
            return { ok: true as const };
          } catch (e) {
            const msg = actionError(e, "Anulimi i parapagimit dështoi. Provo sërish.");
            if (!msg) { router.replace(backHref); return { ok: true as const }; }
            return { ok: false as const, error: msg };
          }
        }}
      />
    </section>
  );
}
