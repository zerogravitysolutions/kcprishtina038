// The querystring vocabulary every finance screen shares: the "no filter"
// sentinel and the year window.
//
// WHY THIS FILE EXISTS AT ALL. `ALL` used to be declared inside a "use client"
// component and imported from the server component that renders it. Under the
// RSC transform a client module seen from the server is replaced by a
// client-reference proxy, so `ALL` arrived on the server as an opaque OBJECT,
// not the string "all": `(sp.cat ?? ALL).trim()` threw, and every `x === ALL`
// comparison silently read false. A Server Component may import COMPONENTS and
// TYPES from a "use client" module, never values — so a value both sides need
// lives here, in a module with no "use client" and no server-only imports, and
// is imported by both.
//
// The other rule encoded here: the DEFAULT window is the MOST RECENT YEAR THAT
// HOLDS ROWS, not the calendar year. "Të gjitha vitet" stays available, but
// only as an explicit choice, so nobody has to remember to narrow the frame
// before reading a figure.
//
// WHY NOT THE CALENDAR YEAR. It used to be, and for most of the year the two
// are the same value. On 1 January they stop being: the calendar-year default
// lands the owner on Hyrjet €0.00 / Daljet €0.00 / Bilanci €0.00 with the whole
// ledger sitting one chip away, which reads as a broken page rather than as an
// empty year. Defaulting to the newest year that actually has data means every
// screen opens on rows, on every day of the year. The window is announced on
// screen either way — a default nobody chose is exactly the one that has to say
// its own name.

/** The value every "no filter" option carries in the querystring. */
export const ALL = "all";

/** The label of the catch-all year option. Listed LAST, never first. */
export const ALL_YEARS_LABEL = "Të gjitha vitet";

/**
 * What to print beside a figure that is deliberately a position rather than an
 * annual flow (open member debt, what the club owes people, open pledges).
 * Those figures ignore the year on purpose, so they have to say so.
 */
export const ALL_TIME_NOTE = "të gjitha vitet";

/** The calendar year, as the four-character string the filters speak in. */
export function currentYear(): string {
  return String(new Date().getFullYear());
}

export function isYear(value: string | null | undefined): value is string {
  return !!value && /^\d{4}$/.test(value);
}

/**
 * The year a value belongs to, whether it arrives as "2026" or as a
 * "2026-08-14" date column. Anything else has no year and says so with null
 * instead of guessing one.
 */
export function yearOfValue(value: string | null | undefined): string | null {
  const y = (value ?? "").slice(0, 4);
  return isYear(y) ? y : null;
}

/**
 * THE DEFAULT WINDOW: the newest year among the rows a screen holds.
 *
 * `available` may carry plain years or whole dates, in any order, with junk in
 * it — every screen feeds this the same list it feeds `yearChoices`, so the
 * default is by construction one of the offered chips. A club with no rows at
 * all has no newest year, and only then does the calendar year stand in: there
 * is nothing to land on, so landing on today is as good as it gets.
 *
 * A year in the FUTURE is never landed in. `occurred_on` is a free date field
 * with no upper bound in the schema and no `max` on the input, so one mistyped
 * "2062" would otherwise become the default frame of every finance screen at
 * once and leave this year's ledger reading €0.00 — exactly the empty page this
 * rule exists to prevent, only triggered by a typo instead of by the calendar.
 * The mistyped year still gets a chip (see `yearChoices` and `yearSpan`), so the
 * row can be found and corrected.
 */
export function defaultYear(available: Iterable<string | null | undefined>): string {
  const now = currentYear();
  let newest: string | null = null;
  for (const v of available) {
    const y = yearOfValue(v);
    if (!y || y > now) continue;
    if (newest === null || y > newest) newest = y;
  }
  return newest ?? now;
}

/**
 * The year window a screen should render.
 *
 * An EXPLICIT parameter always wins and is read exactly as before: "all" widens
 * the frame, a 4-digit year is that year. Only the ABSENT (and junk) case has
 * moved — it is now the newest year with data rather than the calendar year —
 * which is why `available` has to be handed in. It is a required argument on
 * purpose: an optional one would let a call site quietly fall back to a second,
 * different default, and there is only ever one default in this panel.
 */
export function parseYearParam(
  param: string | null | undefined,
  available: Iterable<string | null | undefined>,
): string {
  const v = (param ?? "").trim();
  if (v === ALL) return ALL;
  return isYear(v) ? v : defaultYear(available);
}

/**
 * The years to offer, newest first.
 *
 * This used to force the CURRENT year into the list on the grounds that it was
 * the default and "a default that is missing from its own picker cannot be
 * returned to". That reason is gone: the default is now the newest year that
 * holds rows, which comes out of `known` itself. So the current year is no
 * longer pinned to the top — an empty chip for a year nothing happened in is a
 * dead end that reads like a broken filter. What is still guaranteed is that
 * the picker contains whatever is SELECTED (a bookmarked ?y=2019 still shows
 * which window it is in) and that it is never empty: with no rows anywhere the
 * default falls back to the calendar year, so that is the one chip offered.
 */
export function yearChoices(known: Iterable<string | null | undefined>, selected: string): string[] {
  const set = new Set<string>();
  for (const v of known) {
    const y = yearOfValue(v);
    if (y) set.add(y);
  }
  if (isYear(selected)) set.add(selected);
  if (set.size === 0) set.add(currentYear());
  return [...set].sort((a, b) => b.localeCompare(a));
}

/**
 * Every year from the oldest row to the newest, so a picker built from two
 * bounds instead of from the rows themselves has no holes in it. It stops at
 * the newest ROW, not at today: past the last row there is nothing to show, and
 * the day a row lands in a new year that year becomes both the newest bound and
 * the default. With no rows at all there is one year to offer, this one.
 *
 * The FILL stops at this year even when the newest row is dated past it: a
 * mistyped "2062" must not print forty dead chips across the filter bar (and
 * wrap it into six rows on a phone). That year is still offered as a chip of its
 * own, because the way to fix the typo is to open the year and edit the row —
 * and so is this one, which `defaultYear` falls back to in that case.
 */
export function yearSpan(
  oldest: string | null | undefined,
  newest: string | null | undefined,
): string[] {
  const first = yearOfValue(oldest) ?? yearOfValue(newest);
  const last = yearOfValue(newest) ?? yearOfValue(oldest);
  if (!first || !last) return [currentYear()];
  const from = Math.min(Number(first), Number(last));
  const to = Math.max(Number(first), Number(last));
  const fillTo = Math.min(to, Number(currentYear()));
  const out: string[] = [];
  for (let y = Math.min(from, fillTo); y <= fillTo; y++) out.push(String(y));
  if (to > fillTo) out.push(String(to));
  return out;
}

/** How the selected window reads inside a sentence. */
export function yearWindowLabel(year: string): string {
  return year === ALL ? ALL_TIME_NOTE : year;
}
