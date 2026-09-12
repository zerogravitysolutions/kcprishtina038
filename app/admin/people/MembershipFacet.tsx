"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { formatDate, hasAmount as rowHasAmount, MEMBERSHIP_STATUS_LABEL, periodLabel, planAmountLabel } from "@/lib/finance";
import { parseStrictNumber } from "@/lib/numeric";
import { endPersonMembership, setPersonMembership } from "./actions";
import { StartDateNote } from "./StartDateNote";
import {
  addDays, anchorDay, endCutoff, endDateError, latestEndDate, laterInvoicesOnEnd, laterInvoicesOnReopen,
  lostMonthsSentence, membershipAmountLabel, monthStartOf, monthsLostOnReopen, nextAnchoredInvoice,
  periodsAfter, planChangeCase, reopenEndOf, reopenReason, startDateError, willBeInvoiced,
} from "./membership";

// ---------------------------------------------------------------------------
// THE MEMBERSHIP FACET — the fourth thing a person on this screen can have.
//
// A person here may hold an account (they log in and carry the invoices), a
// roster row (they are public and selectable in training) and, now, a
// MEMBERSHIP: which academy tier they are on, at what monthly price, and from
// which DAY — the day the club bills them on, every month, for as long as it
// runs (generate_dues_anchored_for_date, migration 20260818000001).
//
// Before this panel the only code that could write one was the enrolment of a
// PENDING application, so an existing member could not be put on a plan, moved
// between tiers, repriced, or taken off the academy without an engineer running
// SQL. Ending a membership is how "remove them from the academy" is expressed:
// it stops the automatic invoices at once and deletes nothing.
//
// Rendered for admin + staff only — the page does not even query memberships
// for an editor (RLS denies them the money). Writes are refused again BY THE
// SERVER ACTION (requireMoneyStaff() in ./actions.ts).
// ---------------------------------------------------------------------------

export type MembershipPlanOption = {
  id: string;
  name_sq: string;
  /** Null on a non-billable tier ("Garues"), which has no price at all. */
  amount_eur: number | string | null;
  billable: boolean;
  active: boolean;
};

export type CurrentMembership = {
  id: string;
  plan_id: string;
  /** Frozen from the plan when the membership was opened, editable per rider. */
  amount_eur: number | string | null;
  billable: boolean;
  start_date: string;
  end_date: string | null;
  status: string;
  /** An invoice already points at this row, so closing it is an accounting
   * event. A page snapshot — only the early warning; the server re-checks. */
  hasInvoices: boolean;
};

export type PreviousMembership = {
  planName: string;
  amountLabel: string;
  start_date: string;
  end_date: string | null;
  /** 'ended' or 'paused' — a paused period is not a closed one. */
  status: string;
};

type Props = {
  memberId: string;
  name: string;
  plans: MembershipPlanOption[];
  current: CurrentMembership | null;
  /** The last closed period, shown only when there is no active one. */
  previous: PreviousMembership | null;
  /** Months (first-of-month) this member already has an invoice for, on any
   * membership. The billing job skips them, so the panel does too. */
  invoicedPeriods: string[];
  /** Admin: the plan catalogue is theirs to edit. Staff are sent to an admin. */
  canEditPlans: boolean;
  /** The CLUB's today (clubTodayISO), computed on the server. */
  today: string;
  /** The last day the 03:20 UTC billing job has processed (lastBillingRunDay). */
  lastRunDay: string;
};

/** The plan a membership sits on, by id — including archived ones. */
function planOf(plans: MembershipPlanOption[], id: string | null): MembershipPlanOption | null {
  return plans.find((p) => p.id === id) ?? null;
}

function planName(plans: MembershipPlanOption[], id: string | null): string {
  // A membership can outlive its tier: the row keeps its own price, so the
  // period is still real and must render — with the name that is missing.
  return planOf(plans, id)?.name_sq ?? "Plan i arkivuar";
}

/** The price a plan starts the amount field at. Non-billable tiers have none. */
function defaultAmount(plan: MembershipPlanOption | null): string {
  if (!plan || !plan.billable || !rowHasAmount(plan)) return "";
  return String(Number(plan.amount_eur));
}

/** A stored amount as field text. A missing amount stays EMPTY — never "0",
 * which would read as a waiver nobody granted. */
function amountField(value: number | string | null): string {
  return rowHasAmount({ amount_eur: value }) ? String(Number(value)) : "";
}

type SaveResult = { ok: true } | { ok: false; error: string };

export function MembershipFacet({
  memberId, name, plans, current, previous, invoicedPeriods, canEditPlans, today, lastRunDay,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "change" | "end">(null);
  /** The server's own explanation when it refused an unconfirmed close. */
  const [serverReason, setServerReason] = useState<string | null>(null);
  /** Invoiced months the server named in that explanation; sent back with the
   * confirmation so it knows they were shown. */
  const [serverLater, setServerLater] = useState<string[]>([]);
  /** The same pair for ending the membership. */
  const [endServerReason, setEndServerReason] = useState<string | null>(null);
  const [endServerLater, setEndServerLater] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const initialPlanId = current?.plan_id ?? plans.find((p) => p.billable && p.active)?.id ?? plans[0]?.id ?? "";
  const [planId, setPlanId] = useState(initialPlanId);
  const [amount, setAmount] = useState(() =>
    current ? amountField(current.amount_eur) : defaultAmount(planOf(plans, initialPlanId)),
  );
  const [startDate, setStartDate] = useState(current?.start_date ?? today);
  const [endDate, setEndDate] = useState(current ? latestEndDate(current.start_date, today) : today);

  // Reset on the CLOSED → OPEN transition only, so a router.refresh() landing
  // after a save cannot wipe the panel while it is being read.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const pid = current?.plan_id ?? plans.find((p) => p.billable && p.active)?.id ?? plans[0]?.id ?? "";
      setPlanId(pid);
      setAmount(current ? amountField(current.amount_eur) : defaultAmount(planOf(plans, pid)));
      setStartDate(current?.start_date ?? today);
      setEndDate(current ? latestEndDate(current.start_date, today) : today);
      setError(null);
      setConfirm(null);
      setServerReason(null);
      setServerLater([]);
      setEndServerReason(null);
      setEndServerLater([]);
    }
    wasOpen.current = open;
  }, [open, current, plans, today]);

  const plan = planOf(plans, planId);
  const billable = plan?.billable === true;
  // parseStrictNumber, not Number(): an Albanian phone keypad sends "40,5" and
  // Number("40,5") is NaN — the admin would be told a valid amount is invalid.
  const amountNum = amount.trim() === "" ? NaN : parseStrictNumber(amount) ?? NaN;
  const hasAmount = Number.isFinite(amountNum) && amountNum >= 0;
  const effectiveAmount = billable ? (hasAmount ? Math.round(amountNum * 100) / 100 : NaN) : 0;
  const startProblem = startDateError(startDate, today);
  const endMax = current ? latestEndDate(current.start_date, today) : today;
  // Not started and nothing invoiced: ending REMOVES the row (see
  // endPersonMembership), so there is no end date to pick or validate.
  const removable = !!current && current.start_date > today && !current.hasInvoices;
  const endProblem = current && !removable ? endDateError(endDate, current.start_date, today) : null;
  // Invoiced months the end would leave uncovered (an early-billed next month).
  const endLater = current && !removable && !endProblem
    ? periodsAfter(invoicedPeriods, endCutoff(current.start_date, endDate, today))
    : [];
  const endLaterText = laterInvoicesOnEnd(endLater.map((period) => ({ period })));

  // The SAME case test the server action and set_member_plan run — here only
  // as the early warning; the action re-reads the row and decides.
  const planCase = planChangeCase(current, current?.hasInvoices ?? false, {
    planId,
    amount: Number.isFinite(effectiveAmount) ? effectiveAmount : -1,
    billable,
    startDate,
  });
  const localReason = current ? reopenReason(current.start_date, current.hasInvoices, startDate) : "";
  // What a close-and-open costs beyond the reason itself: months the job will
  // no longer cut (the row is 'ended' at once, even for a future start) and
  // issued invoices that fall inside the new period.
  const reopening = planCase === "reopen" && current !== null;
  const lostMonths = reopening && current
    ? monthsLostOnReopen(current, startDate, lastRunDay, invoicedPeriods)
    : [];
  const reopenLater = reopening && current
    ? periodsAfter(invoicedPeriods, reopenEndOf(current.start_date, startDate))
    : [];
  const reopenExtra = [
    lostMonthsSentence(lostMonths),
    laterInvoicesOnReopen(reopenLater.map((period) => ({ period }))),
  ].filter(Boolean).join(" ");

  // ------------------------------------------------------------------ summary
  const currentPlanName = current ? planName(plans, current.plan_id) : null;
  const currentAmount = current ? membershipAmountLabel(current) : null;
  const currentInvoiced = current ? current.status === "active" && willBeInvoiced(current) : false;
  const currentDay = current ? anchorDay(current.start_date) : null;
  const nextInvoice =
    current && currentInvoiced
      ? nextAnchoredInvoice(current.start_date, lastRunDay, invoicedPeriods, current.end_date)
      : null;
  const nextPeriod = nextInvoice ? monthStartOf(nextInvoice) : null;

  /** Why a billable membership produces no automatic invoice. */
  function noInvoiceReason(c: CurrentMembership): string {
    if (c.status !== "active") return "anëtarësia nuk është aktive";
    if (!rowHasAmount(c)) return "shuma mungon, prandaj nuk faturohet";
    if (Number(c.amount_eur) === 0) return "shuma është 0 (e falur), prandaj nuk faturohet";
    return "asnjë e planifikuar";
  }

  /** The write itself. Reports through the caller so the confirm dialog can
   * show a failure in place instead of closing over a silent error. */
  async function runSave(confirmClose: boolean): Promise<SaveResult> {
    const failed = "Ruajtja e anëtarësisë dështoi. Provo sërish.";
    try {
      const r = await setPersonMembership({
        memberId,
        planId,
        // Not read at all by the action on a non-billable tier, and forced to 0
        // again in SQL — a racer cannot be billed by a stale field.
        amountEur: billable ? amountNum : 0,
        startDate,
        confirmClose,
        acceptedLaterPeriods: [...reopenLater, ...serverLater],
      });
      if (!r.ok) {
        if (r.needsConfirm) {
          // The server saw what the page snapshot did not (an invoice cut in
          // the meantime): nothing was written, the admin decides.
          setError(null);
          setServerReason(r.error);
          setServerLater(r.laterPeriods ?? []);
          setConfirm("change");
          return { ok: false, error: "Diçka ndryshoi ndërkohë — lexo sërish paralajmërimin më sipër dhe konfirmo." };
        }
        setError(r.error);
        return { ok: false, error: r.error };
      }
      setError(null);
      setOpen(false);
      router.refresh();
      return { ok: true };
    } catch (e) {
      const msg = actionError(e, failed) ?? failed;
      setError(msg);
      return { ok: false, error: msg };
    }
  }

  function save() {
    if (!planId) { setError("Zgjidh një plan anëtarësie."); return; }
    if (billable && !hasAmount) { setError("Shkruaj shumën mujore, p.sh. 40 ose 40,5."); return; }
    // The server validates this again: React masks a Server Action throw in
    // production, so this copy is the message and the server copy is the guard.
    if (startProblem) { setError(startProblem); return; }
    // Closing a period is an accounting event — never a side effect of Ruaj.
    if (planCase === "reopen") {
      setError(null); setServerReason(null); setServerLater([]); setConfirm("change"); return;
    }
    start(async () => { setError(null); await runSave(false); });
  }

  async function endNow(): Promise<SaveResult> {
    const failed = "Përfundimi i anëtarësisë dështoi. Provo sërish.";
    if (!current) return { ok: false, error: "Nuk ka anëtarësi aktive." };
    if (endProblem) return { ok: false, error: endProblem };
    try {
      const r = await endPersonMembership({
        membershipId: current.id,
        endDate,
        acceptedLaterPeriods: [...endLater, ...endServerLater],
      });
      if (!r.ok) {
        if (r.needsConfirm) {
          // Invoices after the end that this page did not know about: named
          // by the server, shown in the dialog, confirmed with a second press.
          setEndServerReason(r.error);
          setEndServerLater(r.laterPeriods ?? []);
          return { ok: false, error: "Lexo paralajmërimin më sipër dhe konfirmo sërish." };
        }
        return { ok: false, error: r.error };
      }
      setOpen(false);
      router.refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: actionError(e, failed) ?? failed };
    }
  }

  const formId = `mbs-form-${memberId}`;
  const plansHint = canEditPlans ? (
    <>
      Nuk ka plane anëtarësie. Shtoji te <Link href="/admin/plans">Klubi › Planet e anëtarësisë</Link>.
    </>
  ) : (
    "Nuk ka plane anëtarësie. Kërkoji një admini t’i shtojë te Klubi › Planet e anëtarësisë."
  );

  return (
    <>
      <div className="mbs-cell">
        {current ? (
          <>
            <div className="mbs-sum">
              <span className={`badge-st ${current.status === "active" ? "ok" : "neutral"}`}>{currentPlanName}</span>
              <span className="mbs-amount">{currentAmount}</span>
            </div>
            <div className="mbs-meta">
              nga {formatDate(current.start_date)}
              {/* A Garues, a waiver or a missing amount is never invoiced, so
                  it has no billing day worth naming. */}
              {currentInvoiced
                ? ` · dita e faturimit ${currentDay ?? "—"}${nextInvoice ? ` · fatura tjetër ${formatDate(nextInvoice)}` : ""}`
                : " · pa faturim"}
            </div>
          </>
        ) : (
          <>
            <span className="mbs-none">Nuk ka anëtarësi</span>
            {previous && (
              <div className="mbs-meta">
                {MEMBERSHIP_STATUS_LABEL[previous.status as keyof typeof MEMBERSHIP_STATUS_LABEL] ?? previous.status}
                {previous.end_date ? ` më ${formatDate(previous.end_date)}` : ""} · {previous.planName}
              </div>
            )}
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm mbs-open" onClick={() => setOpen(true)}>
          Anëtarësia
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Anëtarësia — ${name}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost mbs-btn" onClick={() => setOpen(false)} disabled={pending}>
              Mbyll
            </button>
            <button
              type="submit"
              form={formId}
              className="btn btn-ember mbs-btn"
              disabled={pending || plans.length === 0 || planCase === "same" || !!startProblem}
            >
              {pending ? "Duke ruajtur…" : current ? "Ruaj ndryshimin" : "Cakto anëtarësinë"}
            </button>
          </>
        }
      >
        <div className="mbs">
          {/* ---------- what is true right now ---------- */}
          <section className="mbs-sec">
            <h4 className="mbs-h">Gjendja</h4>
            {current ? (
              <dl className="mbs-dl">
                <div className="mbs-f">
                  <dt className="mbs-k">Plani</dt>
                  <dd className="mbs-v">{currentPlanName}</dd>
                </div>
                <div className="mbs-f">
                  <dt className="mbs-k">Shuma mujore</dt>
                  <dd className="mbs-v">{currentAmount}</dd>
                </div>
                <div className="mbs-f">
                  <dt className="mbs-k">Fillimi</dt>
                  <dd className="mbs-v num">{formatDate(current.start_date)}</dd>
                </div>
                <div className="mbs-f">
                  <dt className="mbs-k">Statusi</dt>
                  <dd className="mbs-v">
                    {MEMBERSHIP_STATUS_LABEL[current.status as keyof typeof MEMBERSHIP_STATUS_LABEL] ?? current.status}
                    {current.end_date && <span className="mbs-vs">deri më {formatDate(current.end_date)}</span>}
                  </dd>
                </div>
                {current.billable ? (
                  <>
                    <div className="mbs-f">
                      <dt className="mbs-k">Dita e faturimit</dt>
                      <dd className="mbs-v num">
                        {currentDay ?? "—"}
                        <span className="mbs-vs">çdo muaj, sipas ditës së fillimit</span>
                      </dd>
                    </div>
                    <div className="mbs-f">
                      <dt className="mbs-k">Fatura tjetër automatike</dt>
                      <dd className="mbs-v num">
                        {nextInvoice ? formatDate(nextInvoice) : "—"}
                        <span className="mbs-vs">
                          {nextInvoice
                            ? `për ${periodLabel(nextPeriod ?? nextInvoice)}, afati ${formatDate(addDays(nextInvoice, 5))}`
                            : noInvoiceReason(current)}
                        </span>
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="mbs-f">
                    <dt className="mbs-k">Faturimi</dt>
                    <dd className="mbs-v">
                      Pa faturim
                      <span className="mbs-vs">ky plan nuk faturohet</span>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mbs-empty">
                Nuk ka anëtarësi.{" "}
                {previous
                  ? `Periudha e fundit ishte ${previous.planName} (${previous.amountLabel}), nga ${formatDate(previous.start_date)}${previous.end_date ? ` deri më ${formatDate(previous.end_date)}` : ""}.`
                  : "Ky person nuk ka qenë kurrë në një plan."}
              </p>
            )}
          </section>

          {/* ---------- change it ---------- */}
          <section className="mbs-sec">
            <h4 className="mbs-h">{current ? "Ndrysho anëtarësinë" : "Cakto anëtarësinë"}</h4>
            {plans.length === 0 ? (
              <p className="mbs-empty">{plansHint}</p>
            ) : (
              <form
                id={formId}
                className="mbs-form"
                onSubmit={(e) => { e.preventDefault(); save(); }}
              >
                <div className="field">
                  <label htmlFor={`${formId}-plan`}>Plani</label>
                  <select
                    id={`${formId}-plan`}
                    value={planId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setPlanId(nextId);
                      // The amount must follow the tier at once — a racer must
                      // never be left showing €40 from the tier just left. Going
                      // back to the tier they are already on restores THEIR
                      // price, not the plan's (one member pays €50 on €40).
                      setAmount(
                        current && nextId === current.plan_id
                          ? amountField(current.amount_eur)
                          : defaultAmount(planOf(plans, nextId)),
                      );
                    }}
                    required
                  >
                    {/* Archived tiers are not offered — except the one this
                        member is already on, which must stay selectable or
                        saving anything else would silently move them off it. */}
                    {plans
                      .filter((p) => p.active || p.id === current?.plan_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name_sq} — {planAmountLabel(p)}{p.active ? "" : " (joaktiv)"}
                        </option>
                      ))}
                  </select>
                </div>

                {billable ? (
                  <div className="field">
                    <label htmlFor={`${formId}-amount`}>Shuma mujore (€)</label>
                    <NumericInput
                      id={`${formId}-amount`}
                      kind="decimal"
                      value={amount}
                      onChange={setAmount}
                      required
                      ariaLabel="Shuma mujore në euro"
                    />
                    <span className="mbs-hint">
                      Nis nga çmimi i planit, por mbetet e ndryshueshme — p.sh. një çmim i rënë dakord veç, ose 0 për
                      një lirim të miratuar nga klubi.
                    </span>
                  </div>
                ) : (
                  <p className="mbs-inline">
                    Plani <strong>{plan?.name_sq ?? "i zgjedhur"}</strong> nuk faturohet: garuesi nuk paguan pagesë
                    mujore ndaj klubit, prandaj nuk kërkohet shumë dhe nuk gjenerohet asnjë faturë.
                  </p>
                )}

                <div className="field">
                  <label htmlFor={`${formId}-start`}>Data e fillimit</label>
                  <input
                    id={`${formId}-start`}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <StartDateNote
                  startDate={startDate}
                  today={today}
                  lastRunDay={lastRunDay}
                  billable={billable}
                  amountEur={billable ? (hasAmount ? amountNum : null) : null}
                  invoicedPeriods={invoicedPeriods}
                />

                {planCase === "reopen" && current && (
                  <p className="mbs-warn">
                    Ky ndryshim <strong>përfundon</strong> anëtarësinë e tanishme dhe hap një të re nga{" "}
                    {formatDate(startDate)}, sepse {localReason}. Faturat e lëshuara mbeten me periudhën e vjetër, me
                    planin dhe çmimin e atëhershëm, dhe asnjë prej tyre nuk ndryshon.
                    {reopenExtra ? ` ${reopenExtra}` : ""}
                  </p>
                )}
                {planCase === "correct" && (
                  <p className="mbs-inline">
                    Asnjë faturë nuk varet ende nga kjo anëtarësi dhe data e re nuk vjen pas fillimit të tanishëm,
                    prandaj ndryshimi shkruhet mbi të njëjtin rresht si korrigjim — nuk hapet periudhë e re.
                  </p>
                )}
                {planCase === "same" && (
                  <p className="mbs-inline">Asgjë nuk ka ndryshuar ende.</p>
                )}

                {error && <p className="mbs-err">{error}</p>}
              </form>
            )}
          </section>

          {/* ---------- end it: a separate danger area, far from Mbyll ---------- */}
          {current && current.status === "active" && (
            <section className="mbs-sec mbs-danger">
              <h4 className="mbs-h">Përfundo anëtarësinë</h4>
              {removable ? (
                <p className="mbs-inline">
                  Anëtarësia ende nuk ka filluar (fillon më {formatDate(current.start_date)}) dhe nuk ka asnjë
                  faturë, prandaj hiqet krejt: nuk mbetet asnjë muaj për t’u faturuar, as automatikisht, as me
                  dorë. Personi mbetet në listën e njerëzve.
                </p>
              ) : (
                <>
                  <p className="mbs-inline">
                    Faturat automatike ndalen menjëherë. Asgjë nuk fshihet: faturat e lëshuara, pagesat dhe historiku
                    i planit mbeten siç janë. Muajt deri te data e përfundimit mund t’i gjenerosh me dorë te
                    Financat. Kështu hiqet dikush nga akademia.
                  </p>
                  <div className="field">
                    <label htmlFor={`${formId}-end`}>Data e përfundimit</label>
                    <input
                      id={`${formId}-end`}
                      type="date"
                      value={endDate}
                      min={current.start_date}
                      max={endMax}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    <span className="mbs-hint">
                      Dita e fundit që mbulon anëtarësia — sot ose më herët, jo në të ardhmen.
                    </span>
                  </div>
                  {endProblem && <p className="mbs-err">{endProblem}</p>}
                  {endLaterText && <p className="mbs-warn">{endLaterText}</p>}
                </>
              )}
              <button
                type="button"
                className="btn mbs-end mbs-btn"
                disabled={pending || !!endProblem}
                onClick={() => setConfirm("end")}
              >
                Përfundo anëtarësinë
              </button>
            </section>
          )}
        </div>
      </Modal>

      {/* Siblings of the panel, never nested inside it: two overlays at the same
          z-index, the later one on top, each closing only itself. */}
      <ConfirmModal
        open={confirm === "end"}
        onClose={() => { setConfirm(null); setEndServerReason(null); setEndServerLater([]); }}
        title="Përfundo anëtarësinë"
        confirmLabel="Përfundo anëtarësinë"
        tone="danger"
        message={
          removable && current && !endServerReason ? (
            <>
              Anëtarësia e <strong>{name}</strong>, që do të fillonte më{" "}
              <strong>{formatDate(current.start_date)}</strong>, hiqet krejt. Nuk mbetet asnjë muaj për t’u
              faturuar, dhe personi mbetet në listën e njerëzve.
            </>
          ) : (
            <>
              Anëtarësia e <strong>{name}</strong> përfundon më <strong>{formatDate(endDate)}</strong>. Faturat
              automatike ndalen menjëherë. Asgjë nuk fshihet — faturat e lëshuara dhe pagesat mbeten në libra, dhe
              personi mbetet në listën e njerëzve. Muajt deri më {formatDate(endDate)} që s’kanë faturë mund t’i
              gjenerosh me dorë te Financat.
              {/* The server's list names numbers and amounts; the page's only months. */}
              {endServerReason ? (
                <span style={{ display: "block", marginTop: 10 }}>{endServerReason}</span>
              ) : endLaterText ? (
                <span style={{ display: "block", marginTop: 10 }}>{endLaterText}</span>
              ) : null}
            </>
          )
        }
        onConfirm={endNow}
      />

      <ConfirmModal
        open={confirm === "change"}
        onClose={() => { setConfirm(null); setServerReason(null); setServerLater([]); }}
        title="Ky ndryshim përfundon një periudhë"
        confirmLabel="Po, ndrysho"
        message={
          serverReason ?? (
            <>
              Anëtarësia e tanishme e <strong>{name}</strong> përfundon dhe hapet një e re nga{" "}
              <strong>{formatDate(startDate)}</strong>, sepse {localReason}. Faturat e lëshuara nuk ndryshojnë.
              {reopenExtra ? <span style={{ display: "block", marginTop: 10 }}>{reopenExtra}</span> : null}
            </>
          )
        }
        onConfirm={() => runSave(true)}
      />
    </>
  );
}
