"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rejectApplication } from "../actions";
import { enrolApplication, type EnrolResult } from "./actions";
import { billingMode, formatDate, formatEur, hasAmount as rowHasAmount, periodLabel, planAmountLabel } from "@/lib/finance";
import { NumericInput } from "@/components/admin/NumericInput";
import { parseStrictNumber } from "@/lib/numeric";
import { addDays, anchorDay, monthStartOf, startDateError } from "@/app/admin/people/membership";
import { StartDateNote } from "@/app/admin/people/StartDateNote";

export type PlanOption = {
  id: string;
  name_sq: string;
  amount_eur: number | string | null;
  billable: boolean;
};

/** An ACTIVE membership the applicant's account already holds (read by the
 * detail page on the caller's session). */
export type ExistingMembership = {
  planId: string;
  planName: string;
  amountEur: number | string | null;
  startDate: string;
  /** Opened after this application was submitted, while it is still pending:
   * an earlier attempt of this enrolment (or Njerëzit in the meantime). Its
   * start date is the member's billing day and a retry must not move it — the
   * server refuses a different one, so the field is locked here. */
  openedWhilePending: boolean;
  /** Months (first-of-month) the account already has an invoice for. */
  invoicedPeriods: string[];
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
  /** Detail only: the CLUB's today (clubTodayISO), computed on the server. */
  today?: string;
  /** Detail only: the last day the billing job processed (lastBillingRunDay). */
  lastRunDay?: string;
  /** Detail only: an active membership the applicant's account already has. */
  existing?: ExistingMembership | null;
  /** Detail only: admin — the plan catalogue is theirs to edit. */
  canEditPlans?: boolean;
};

const MUTED: React.CSSProperties = { color: "var(--text-3)", fontSize: 12.5 };

// The default used to be the FIRST OF NEXT MONTH, and the action then flattened
// whatever was chosen to the 1st anyway. Both are gone: the club bills on the
// day a rider joined, so the honest default is TODAY — the day the admin is
// enrolling them — and the note under the field says what that day causes.

function planOf(plans: PlanOption[], id: string): PlanOption | null {
  return plans.find((p) => p.id === id) ?? null;
}

/** The price a plan starts the amount field at. Non-billable tiers have none. */
function defaultAmount(plan: PlanOption | null): string {
  if (!plan || !plan.billable || !rowHasAmount(plan)) return "";
  return String(Number(plan.amount_eur));
}

/** A stored amount as field text — a missing amount stays empty, never "0". */
function amountField(value: number | string | null): string {
  return rowHasAmount({ amount_eur: value }) ? String(Number(value)) : "";
}

// Approve / reject for one application. In the list this is a link to the
// detail page plus "Refuzo" — approving is never one click any more, because
// enrolment needs decisions (tier, amount, start month) only a human can make.
export function ApplicationActions({
  id, name, status, variant = "row", plans = [], chosenPlanId = null, canAct = true,
  today = "", lastRunDay = "", existing = null, canEditPlans = false,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<EnrolResult, { ok: true }> | null>(null);
  const [rejected, setRejected] = useState(false);
  const router = useRouter();

  // A membership the account already holds wins over the applicant's choice:
  // a retry of a half-finished enrolment must send exactly what the first
  // attempt wrote, or set_member_plan would move the member's billing day.
  const existingPlan = existing ? planOf(plans, existing.planId) : null;
  const initialPlanId =
    existingPlan?.id ||
    (chosenPlanId && planOf(plans, chosenPlanId)?.id) ||
    plans.find((p) => p.billable)?.id ||
    plans[0]?.id ||
    "";
  const [planId, setPlanId] = useState(initialPlanId);
  const [amount, setAmount] = useState(() =>
    existing && existingPlan
      ? (existingPlan.billable ? amountField(existing.amountEur) : "")
      : defaultAmount(planOf(plans, initialPlanId)),
  );
  // The default start is the CLUB's today, computed on the server and passed
  // in: a clock read here (render or useState initialiser) disagrees with the
  // server render around midnight, and the day it lands on becomes the
  // member's billing day for good.
  const [startDate, setStartDate] = useState(existing?.startDate ?? today);
  const [invoiceNow, setInvoiceNow] = useState(true);
  const lockedStart = existing?.openedWhilePending === true;

  const plan = planOf(plans, planId);
  const billable = plan?.billable === true;
  // parseStrictNumber, not Number(): the field is a decimal keypad, so "40,5"
  // is what an Albanian phone actually sends, and Number("40,5") is NaN — the
  // admin would have been told the amount was invalid for a valid amount.
  const amountNum = amount.trim() === "" ? NaN : parseStrictNumber(amount) ?? NaN;
  const hasAmount = Number.isFinite(amountNum) && amountNum >= 0;
  // Null while the field is empty, so a half-typed amount doesn't flash
  // "e falur" at the admin.
  const mode = !billable ? "non_billable" : hasAmount ? billingMode({ billable: true, amount_eur: amountNum }) : null;
  const canInvoice = billable && hasAmount && amountNum > 0;
  // The MONTH the first invoice would bill. The start date itself keeps its day.
  const startPeriod = monthStartOf(startDate);
  const startProblem = startDateError(startDate, today);
  // Months the billing job will skip because an invoice exists: the account's
  // own, plus the first invoice this form is about to create when ticked.
  const knownInvoiced = [
    ...(existing?.invoicedPeriods ?? []),
    ...(canInvoice && invoiceNow && startPeriod ? [startPeriod] : []),
  ];

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
            ? `Anëtarësia: ${formatEur(done.amountEur)} / muaj, nga ${formatDate(done.startDate)}.`
            : `Anëtarësia: pa pagesë mujore, nga ${formatDate(done.startDate)}.`}
        </div>
        {done.billable && done.amountEur > 0 && anchorDay(done.startDate) !== null && (
          <div style={MUTED}>
            Faturimi përsëritet çdo muaj ditën {anchorDay(done.startDate)} — dita e fillimit.
          </div>
        )}
        {done.invoiceNo
          ? (
            <div style={MUTED}>
              Fatura e parë u gjenerua: <span className="mono">{done.invoiceNo}</span> për {periodLabel(done.startDate)},
              me datë {formatDate(done.startDate)} dhe afat {formatDate(addDays(done.startDate, 5) ?? done.startDate)}.
            </div>
          )
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
    // Going back to the tier the account is already on restores ITS price.
    setAmount(
      existing && existingPlan && nextId === existingPlan.id && existingPlan.billable
        ? amountField(existing.amountEur)
        : defaultAmount(planOf(plans, nextId)),
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) { setError("Zgjidh një plan anëtarësie."); return; }
    if (billable && !hasAmount) { setError("Shuma mujore duhet të jetë numër, p.sh. 40 ose 40,5."); return; }
    // The server checks this again — React masks a Server Action throw in
    // production, so this copy exists to name the problem, not to enforce it.
    if (startProblem) { setError(startProblem); return; }
    start(async () => {
      setError(null);
      const r = await enrolApplication({
        appId: id,
        planId,
        amountEur: billable ? amountNum : 0,
        // The DAY goes through untouched: it is the billing anchor.
        startDate,
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
            <label htmlFor="ap-amount">Shuma mujore (€)</label>
            <NumericInput
              id="ap-amount"
              kind="decimal"
              value={amount}
              onChange={setAmount}
              required
              ariaLabel="Shuma mujore në euro"
            />
          </div>
        )}

        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ap-start">Data e fillimit</label>
          {/* A real DATE, not a month. Its DAY is the day this member is billed
              on every month from now on, so flattening it to the 1st (which is
              what this field used to do) took that choice away from the club. */}
          <input
            id="ap-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            readOnly={lockedStart}
            aria-describedby={existing ? "ap-existing" : undefined}
            required
          />
        </div>

        {existing && (
          <div
            id="ap-existing"
            style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--warn-bg)", border: "1px solid color-mix(in oklab, var(--warn) 30%, transparent)", fontSize: 13, color: "var(--text-1)", lineHeight: 1.6 }}
          >
            {lockedStart ? (
              <>
                Një përpjekje e mëparshme e këtij regjistrimi e ka hapur tashmë anëtarësinë:{" "}
                <strong>{existing.planName}</strong>, nga <strong>{formatDate(existing.startDate)}</strong>. Data e
                fillimit mbetet ajo, sepse është dita e faturimit të anëtarit. Nëse duhet ndryshuar, ndryshoje te
                Njerëzit › Anëtarësia pasi të aprovohet aplikimi.
              </>
            ) : (
              <>
                Ky email ka tashmë një anëtarësi aktive: <strong>{existing.planName}</strong>, nga{" "}
                <strong>{formatDate(existing.startDate)}</strong>. Fushat nisin nga ajo, që aprovimi të mos e ndryshojë.
                Një ndryshim që do ta përfundonte refuzohet këtu — bëje te Njerëzit › Anëtarësia, ku konfirmohet.
              </>
            )}
          </div>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <StartDateNote
            startDate={startDate}
            today={today}
            lastRunDay={lastRunDay}
            billable={billable}
            amountEur={hasAmount ? amountNum : null}
            invoicedPeriods={knownInvoiced}
            variant="enrol"
            offersFirstInvoiceFor={canInvoice && !invoiceNow ? startPeriod : null}
          />
          {startProblem && (
            <div style={{ marginTop: 8, color: "var(--err)", fontSize: 12.5, lineHeight: 1.6 }}>{startProblem}</div>
          )}
        </div>
      </div>

      {plans.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--err)", lineHeight: 1.6 }}>
          {canEditPlans ? (
            <>
              Nuk ka plane anëtarësie. Shtoji te <Link href="/admin/plans">Klubi › Planet e anëtarësisë</Link> para se
              ta aprovosh këtë aplikim.
            </>
          ) : (
            "Nuk ka plane anëtarësie. Kërkoji një admini t’i shtojë te Klubi › Planet e anëtarësisë, pastaj aprovoje këtë aplikim."
          )}
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
          Gjenero faturën e parë menjëherë ({formatEur(amountNum)}{startPeriod ? ` për ${periodLabel(startPeriod)}` : ""}
          {addDays(startDate, 5) ? `, me afat ${formatDate(addDays(startDate, 5))}` : ""})
        </label>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-ember" disabled={pending || plans.length === 0 || !!startProblem}>
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
