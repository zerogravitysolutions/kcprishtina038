"use client";

import { formatDate, periodLabel } from "@/lib/finance";
import { startOutlook, willBeInvoiced } from "./membership";

/**
 * WHAT THIS DATE WILL COST, said out loud, under the field that sets it.
 *
 * The start date is the club's billing day (see ./membership.ts), and until
 * this existed the admin could only find that out a month later, from an
 * invoice that arrived on a day nobody had chosen. One member was misfiled by
 * six weeks that way.
 *
 * Rendered by BOTH writers of a start date — the enrolment form in
 * /admin/applications and the membership panel here — from the same helper the
 * server action validates with, so the promise and the database cannot drift.
 *
 * `today` and `lastRunDay` come from the SERVER (clubTodayISO /
 * lastBillingRunDay) as props: reading a clock here would make the server
 * render and hydration disagree around midnight.
 */
export function StartDateNote({
  startDate,
  today,
  lastRunDay,
  billable,
  amountEur,
  invoicedPeriods = [],
  /** Copy for the enrolment form differs in one line; everything else is shared. */
  variant = "membership",
  offersFirstInvoiceFor = null,
}: {
  startDate: string;
  today: string;
  lastRunDay: string;
  billable: boolean;
  /** The amount as typed. Null while the field is empty or half-typed. */
  amountEur: number | null;
  /** Months (first-of-month) the member already has an invoice for. The
   * anchored job skips those, so the note must too. */
  invoicedPeriods?: string[];
  variant?: "membership" | "enrol";
  /** Enrolment only: the month (first-of-month) the form's first-invoice box
   * would bill while it is UNticked. Null when it is ticked or not offered. */
  offersFirstInvoiceFor?: string | null;
}) {
  const outlook = startOutlook(startDate, today, lastRunDay, invoicedPeriods);
  const oneMissed = outlook?.missedMonths === 1;
  // The box creates exactly ONE invoice, for the start month. It is worth
  // naming only when that month is among the missed ones; every other missed
  // month exists only through Financat.
  const boxCovers =
    variant === "enrol" && !!offersFirstInvoiceFor && outlook?.firstMissedPeriod === offersFirstInvoiceFor;
  if (!outlook) {
    return (
      <div className="mbs-note">
        Zgjidh një datë të vlefshme fillimi për ta parë se kur bie fatura e parë.
      </div>
    );
  }

  const typed = amountEur === null || Number.isNaN(amountEur) ? null : amountEur;
  const invoiced = willBeInvoiced({ billable, amount_eur: typed });

  return (
    <div className="mbs-note">
      {/* A non-billable tier is never invoiced, so its billing day is not a
          fact worth stating — it would only suggest a bill that never comes. */}
      {billable && (
        <div className="mbs-note-row">
          <span className="mbs-note-k">Dita e faturimit</span>
          <span className="mbs-note-v">
            dita {outlook.anchorDay} e muajit
            {outlook.anchorDay > 28 && (
              <em className="mbs-note-s">
                {" "}— në muajt më të shkurtër bie ditën e fundit
              </em>
            )}
          </span>
        </div>
      )}

      {invoiced ? (
        <>
          <div className="mbs-note-row">
            <span className="mbs-note-k">
              {outlook.alreadyInvoiced ? "Fatura tjetër automatike" : "Fatura e parë automatike"}
            </span>
            <span className="mbs-note-v">
              {outlook.nextInvoice && outlook.nextPeriod ? (
                <>
                  {formatDate(outlook.nextInvoice)}
                  <em className="mbs-note-s"> për {periodLabel(outlook.nextPeriod)}</em>
                </>
              ) : (
                "Asnjë e planifikuar"
              )}
            </span>
          </div>
          {outlook.nextDue && (
            <div className="mbs-note-row">
              <span className="mbs-note-k">Afati i pagesës</span>
              <span className="mbs-note-v">
                {formatDate(outlook.nextDue)}
                <em className="mbs-note-s"> (data e faturës +5 ditë)</em>
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="mbs-note-row">
          <span className="mbs-note-k">Faturat</span>
          <span className="mbs-note-v">
            {/* Empty is not zero: a half-typed field says what is missing, and
                only a real 0 on a paying tier is a waiver. */}
            {!billable
              ? "Ky plan nuk faturohet, prandaj nuk gjenerohet asnjë faturë."
              : typed === null
                ? "Shkruaj shumën mujore për ta parë kur bie fatura e parë."
                : "Shuma është 0 — anëtarësia është e falur, prandaj nuk gjenerohet asnjë faturë."}
          </span>
        </div>
      )}

      {/* The months whose billing day the daily job has already processed
          without an invoice. Nothing creates them: the job only ever bills the
          day it runs on, so such a month has to be generated by hand from
          /admin/finance. Two different sentences, because a start in the past
          and a start TODAY (whose run is already over) are not the same fact.
          Shown only when the membership is billed at all. */}
      {invoiced && outlook.missedMonths > 0 && (
        <p className="mbs-note-past">
          {outlook.backdated ? (
            <>
              Fillimi është në të kaluarën:{" "}
              {oneMissed
                ? `1 muaj (${periodLabel(outlook.firstMissedPeriod ?? startDate)}) pa faturë nuk krijohet vetvetiu`
                : `${outlook.missedMonths} muaj (nga ${periodLabel(outlook.firstMissedPeriod ?? startDate)}) pa faturë nuk krijohen vetvetiu`}{" "}
              — muajt e shkuar nuk gjenerohen automatikisht.
            </>
          ) : (
            <>
              Muaji i tanishëm ({periodLabel(outlook.firstMissedPeriod ?? startDate)}) nuk gjenerohet vetvetiu,
              sepse faturimi automatik i sotëm ka përfunduar.
            </>
          )}
          {boxCovers
            ? oneMissed
              ? " Shëno faturën e parë këtu poshtë, ose gjeneroje me dorë te Financat."
              : ` Fatura e parë këtu poshtë mbulon vetëm ${periodLabel(offersFirstInvoiceFor ?? startDate)}; muajt e tjerë gjeneroji me dorë te Financat.`
            : oneMissed
              ? " Gjeneroje me dorë te Financat, nëse e do."
              : " Gjeneroji me dorë te Financat, nëse i do."}
        </p>
      )}
    </div>
  );
}
