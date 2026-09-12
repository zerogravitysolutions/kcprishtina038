// The club's calendar, as opposed to the server's.
//
// Kosovo keeps Central European time (IANA has no Europe/Pristina; Kosovo
// follows Europe/Belgrade), while Vercel runs in UTC — so from midnight until
// 01:00/02:00 local, `new Date()` on the server still says YESTERDAY. Anything
// that DEFAULTS a date an admin is about to save (a membership start, which
// becomes the member's billing day for good) or decides a window (how early
// next month may be invoiced) must use the club's day, not the server's.
//
// Plain module: no "use client", no server-only import. Compute these on the
// SERVER and pass them down as props — calling them inside a client
// component's render or useState initialiser makes SSR and hydration disagree
// whenever the two clocks straddle midnight.

export const CLUB_TIME_ZONE = "Europe/Belgrade";

/** "YYYY-MM-DD" — the calendar day it is at the club right now. */
export function clubTodayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM-01" — the first of the club's current month. */
export function clubCurrentPeriod(now: Date = new Date()): string {
  return `${clubTodayISO(now).slice(0, 7)}-01`;
}

// Keep in step with the schedule in migration 20260818000001, section E:
// cron 'dues-generate-daily' at '20 3 * * *' (03:20 UTC).
const BILLING_RUN_UTC_MINUTES = 3 * 60 + 20;

/**
 * The last calendar day the daily anchored-billing job has ALREADY processed.
 *
 * The job runs generate_dues_anchored_for_date(current_date) at 03:20 UTC, and
 * current_date is the database's day (UTC on Supabase). Before 03:20 UTC,
 * today's anchors have not fired yet, so the last processed day is yesterday;
 * from 03:20 on, it is today. A screen predicting "the next automatic invoice"
 * starts from the day AFTER this — otherwise it promises an invoice that has
 * already been cut, or skips one still coming later this morning.
 */
export function lastBillingRunDay(now: Date = new Date()): string {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const back = minutes >= BILLING_RUN_UTC_MINUTES ? 0 : 1;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
  return d.toISOString().slice(0, 10);
}
