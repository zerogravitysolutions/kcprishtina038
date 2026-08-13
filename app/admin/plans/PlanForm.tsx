"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/errors";
import { planAmountLabel } from "@/lib/finance";
import { updatePlan } from "./actions";

export type PlanView = {
  id: string;
  code: string;
  name_sq: string;
  description_sq: string | null;
  amount_eur: number | null;
  billable: boolean;
  active: boolean;
  /** Active memberships frozen on this tier — they keep their own price. */
  active_members: number;
};

export function PlanForm({ plan, canWrite }: { plan: PlanView; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState(plan.name_sq);
  const [description, setDescription] = useState(plan.description_sq ?? "");
  const [amount, setAmount] = useState(plan.amount_eur != null ? String(plan.amount_eur) : "");
  const [billable, setBillable] = useState(plan.billable);
  const [active, setActive] = useState(plan.active);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      try {
        const r = await updatePlan(plan.id, {
          name_sq: name,
          description_sq: description,
          amount_eur: amount,
          billable,
          active,
        });
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setMsg({ ok: true, text: "Plani u ruajt." });
        router.refresh();
      } catch (e) {
        const text = actionError(e, "Ruajtja e planit dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{plan.name_sq}</h3>
        <span className="kicker">{plan.code}</span>
      </div>

      <div className="mono" style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14 }}>
        {/* Never "€0.00" for a racer — the tier is outside billing, not free-of-charge. */}
        {planAmountLabel({ billable: plan.billable, amount_eur: plan.amount_eur })}
        {" · "}
        <span className={`badge-st ${plan.active ? "ok" : "neutral"}`}>{plan.active ? "Aktive" : "Joaktive"}</span>
        {" "}
        <span className="badge-st neutral">{plan.active_members} anëtarësi aktive</span>
      </div>

      <div className="field">
        <label htmlFor={`name-${plan.id}`}>Emri</label>
        <input
          id={`name-${plan.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canWrite}
        />
      </div>

      <div className="field">
        <label htmlFor={`desc-${plan.id}`}>Përshkrimi</label>
        <textarea
          id={`desc-${plan.id}`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canWrite}
        />
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: 13, fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            disabled={!canWrite}
            style={{ width: 16, height: 16 }}
          />
          Faturohet çdo muaj
        </label>
        {!billable ? (
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            Pa pagesë — anëtarët e këtij plani nuk marrin kurrë faturë.
          </div>
        ) : null}
      </div>

      {billable ? (
        <div className="field">
          <label htmlFor={`amount-${plan.id}`}>Çmimi mujor (€)</label>
          <input
            id={`amount-${plan.id}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="p.sh. 40"
            disabled={!canWrite}
          />
        </div>
      ) : null}

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: 13, fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={!canWrite}
            style={{ width: 16, height: 16 }}
          />
          Shfaqet në formularin e regjistrimit
        </label>
      </div>

      {canWrite ? (
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ruaj"}
        </button>
      ) : null}
      {msg ? <div className={`mm-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
    </div>
  );
}
