"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rejectApplication } from "../actions";
import { enrolApplication, type EnrolResult } from "./actions";
import { billingMode, currentPeriod, formatEur, periodLabel, periodParam, planAmountLabel, shiftPeriod } from "@/lib/finance";

export type PlanOption = {
  id: string;
  name_sq: string;
  amount_eur: number | string | null;
  billable: boolean;
};

type Props = {
  id: string;
  name: string;
  status: string;
  /** "row" = the list (review link + reject). "detail" = the enrolment form. */
  variant?: "row" | "detail";
  /** Detail only: the tiers the admin can enrol into. */
  plans?: PlanOption[];
  /** Detail only: the tier the applicant picked on /join. */
  chosenPlanId?: string | null;
  /** False for an editor: may read the application, may not approve or reject. */
  canAct?: boolean;
};

const MUTED: React.CSSProperties = { color: "var(--text-3)", fontSize: 12.5 };

/** First of next month — the usual start, because the club bills whole months. */
function defaultStartMonth(): string {
  return periodParam(shiftPeriod(currentPeriod(), 1));
}

function planOf(plans: PlanOption[], id: string): PlanOption | null {
  return plans.find((p) => p.id === id) ?? null;
}

/** The price a plan starts the amount field at. Non-billable tiers have none. */
function defaultAmount(plan: PlanOption | null): string {
  if (!plan || !plan.billable) return "";
  const n = Number(plan.amount_eur ?? 0);
  return Number.isFinite(n) ? String(n) : "";
}

// Approve / reject for one application. In the list this is a link to the
// detail page plus "Refuzo" — approving is never one click any more, because
// enrolment needs decisions (tier, amount, start month) only a human can make.
export function ApplicationActions({ id, name, status, variant = "row", plans = [], chosenPlanId = null, canAct = true }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<EnrolResult, { ok: true }> | null>(null);
  const [rejected, setRejected] = useState(false);
  const router = useRouter();

  const initialPlanId =
    (chosenPlanId && planOf(plans, chosenPlanId)?.id) ||
    plans.find((p) => p.billable)?.id ||
    plans[0]?.id ||
    "";
  const [planId, setPlanId] = useState(initialPlanId);
  const [amount, setAmount] = useState(() => defaultAmount(planOf(plans, initialPlanId)));
  const [startMonth, setStartMonth] = useState(defaultStartMonth);
  const [invoiceNow, setInvoiceNow] = useState(true);

  const plan = planOf(plans, planId);
  const billable = plan?.billable === true;
  const amountNum = amount.trim() === "" ? NaN : Number(amount);
  const hasAmount = Number.isFinite(amountNum) && amountNum >= 0;
  // Null while the field is empty, so a half-typed amount doesn't flash
  // "e falur" at the admin.
  const mode = !billable ? "non_billable" : hasAmount ? billingMode({ billable: true, amount_eur: amountNum }) : null;
  const canInvoice = billable && hasAmount && amountNum > 0;
  const startPeriod = /^\d{4}-\d{2}$/.test(startMonth) ? `${startMonth}-01` : null;

  // The success panel outlives the row: after the action runs the application
  // is no longer 'pending', so without this the whole thing would vanish and
  // the admin would never see the generated password.
  if (done) {
    return (
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        <div style={{ color: "var(--ok)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          ✓ Aplikimi u aprovua dhe anëtari u regjistrua.
        </div>
        {done.linked && <div style={MUTED}>Ky email kishte llogari — u lidh me profilin ekzistues.</div>}
        {done.password && (
          <div>
            <span style={MUTED}>Fjalëkalimi fillestar: </span>
            <span className="mono" style={{ fontSize: 13.5, color: "var(--text-1)" }}>{done.password}</span>
            <div style={MUTED}>Jepja anëtarit — nuk shfaqet më pas rifreskimit të faqes.</div>
          </div>
        )}
        <div style={MUTED}>
          {done.billable
            ? `Anëtarësia: ${formatEur(done.amountEur)} / muaj, nga ${periodLabel(done.startDate)}.`
            : `Anëtarësia: pa pagesë mujore, nga ${periodLabel(done.startDate)}.`}
        </div>
        {done.invoiceNo
          ? <div style={MUTED}>Fatura e parë u gjenerua: <span className="mono">{done.invoiceNo}</span></div>
          : done.billable && <div style={MUTED}>Nuk u gjenerua asnjë faturë tani. Gjeneroje te Faturat e anëtarëve kur ta duash.</div>}
        {done.warning && <div style={{ color: "var(--warn)", fontSize: 12.5, lineHeight: 1.6 }}>{done.warning}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <Link className="btn btn-sm" href="/admin/people">Shko te njerëzit</Link>
          {done.billable && <Link className="btn btn-sm btn-ghost" href="/admin/finance">Faturat e anëtarëve</Link>}
        </div>
      </div>
    );
  }

  // Approving and rejecting are admin/staff in SQL. An editor may read the
  // application, so the list still links to it, but no control they cannot use
  // is rendered — and the enrolment form is never one of them.
  if (!canAct) {
    if (variant === "detail") {
      return <div style={MUTED}>Vetëm admini ose stafi mund ta aprovojë ose ta refuzojë një aplikim.</div>;
    }
    return <Link className="btn" href={`/admin/applications/${id}`}>Shqyrto</Link>;
  }

  if (rejected || status !== "pending") {
    if (variant === "detail") {
      return <div style={MUTED}>Ky aplikim është shqyrtuar tashmë — nuk ka veprime të mbetura.</div>;
    }
    return <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>Pa veprime</span>;
  }

  const onReject = () => {
    const reason = prompt(`Arsyeja e refuzimit për "${name}" (opsionale):`, "");
    if (reason === null) return; // user pressed Cancel
    start(async () => {
      setError(null);
      const r = await rejectApplication(id, reason || null);
      if (r.ok) { setRejected(true); router.refresh(); }
      else setError(r.error ?? "Refuzimi dështoi.");
    });
  };

  // ---------- list row: review, don't approve blind ----------
  if (variant !== "detail") {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Link className="btn" href={`/admin/applications/${id}`}>Shqyrto</Link>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onReject}>Refuzo</button>
        {error && <span style={{ color: "var(--err)", fontSize: 11 }}>{error}</span>}
      </div>
    );
  }

  // ---------- detail page: approve = enrol ----------
  const onPlanChange = (nextId: string) => {
    setPlanId(nextId);
    // The amount and the notice must follow the tier immediately — a racer must
    // never be left showing €40 from the tier the admin just switched away from.
    setAmount(defaultAmount(planOf(plans, nextId)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) { setError("Zgjidh një plan anëtarësie."); return; }
    start(async () => {
      setError(null);
      const r = await enrolApplication({
        appId: id,
        planId,
        amountEur: billable ? amountNum : 0,
        startDate: startMonth,
        generateFirstInvoice: canInvoice && invoiceNow,
      });
      if (r.ok) { setDone(r); router.refresh(); }
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
          <label>Plani i anëtarësisë</label>
          <select value={planId} onChange={(e) => onPlanChange(e.target.value)} required>
            {plans.length === 0 && <option value="">Nuk ka plane</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_sq} — {planAmountLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {billable && (
          <div className="field" style={{ margin: 0 }}>
            <label>Shuma mujore (€)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        )}

        <div className="field" style={{ margin: 0 }}>
          <label>Muaji i parë</label>
          {/* type="month" degrades to a text box in Safari — the placeholder is
              the only hint the admin gets about the expected format there. */}
          <input type="month" placeholder="2026-09" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
        </div>
      </div>

      {plans.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--err)", lineHeight: 1.6 }}>
          Nuk ka plane anëtarësie. Shtoji te Financat › Planet para se ta aprovosh këtë aplikim.
        </div>
      )}

      {mode === "non_billable" && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Ky plan nuk faturohet. Garuesi nuk paguan pagesë mujore ndaj klubit, prandaj nuk kërkohet shumë dhe nuk gjenerohet asnjë faturë.
        </div>
      )}
      {mode === "waived" && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Shuma është 0 — anëtarësia regjistrohet si e falur (p.sh. lirim i miratuar nga klubi) dhe nuk gjenerohet asnjë faturë.
        </div>
      )}

      {canInvoice && (
        <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, fontSize: 13.5, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={invoiceNow} onChange={(e) => setInvoiceNow(e.target.checked)} />
          Gjenero faturën e parë menjëherë ({formatEur(amountNum)}{startPeriod ? ` për ${periodLabel(startPeriod)}` : ""})
        </label>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-ember" disabled={pending || plans.length === 0}>
          {pending ? "Duke regjistruar…" : "Aprovo dhe regjistro"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onReject}>Refuzo</button>
        {error && <span style={{ color: "var(--err)", fontSize: 12.5 }}>{error}</span>}
      </div>

      <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }}>
        Aprovimi krijon llogarinë e anëtarit, profilin dhe planin e pagesave. Nëse email-i ka tashmë llogari, ajo lidhet me këtë aplikim.
        <br />
        {/* The roster row is what makes the person selectable in training — and
            the same row is rendered on the public /team page. The admin must
            know that before pressing the button, not afterwards. */}
        Aprovimi e shton personin edhe në regjistrin e ekipit si çiklist aktiv, prandaj emri i tij shfaqet menjëherë në
        faqen publike <em>Ekipi</em> (pa foto dhe pa biografi). Nëse nuk e do publik, hiqe ose vendose si “ish-anëtar”
        te Njerëzit menjëherë pas aprovimit.
      </div>
    </form>
  );
}
