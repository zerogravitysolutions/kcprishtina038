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
// The other rule encoded here: the DEFAULT window is the CURRENT year on every
// screen. "Të gjitha vitet" stays available, but only as an explicit choice, so
// nobody has to remember to narrow the frame before reading a figure.

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
 * The year window a screen should render. No parameter (and any junk) means
 * THIS year; "all" is the only way to widen it, and it has to be asked for.
 */
export function parseYearParam(param: string | null | undefined): string {
  const v = (param ?? "").trim();
  if (v === ALL) return ALL;
  return isYear(v) ? v : currentYear();
}

/**
 * The years to offer, newest first. The current year is always offered even
 * when it holds no rows yet — it is the default, and a default that is missing
 * from its own picker cannot be returned to. So is whatever year is selected,
 * so a bookmarked ?y=2019 still shows which window it is in.
 */
export function yearChoices(known: Iterable<string>, selected: string): string[] {
  const set = new Set<string>();
  for (const y of known) if (isYear(y)) set.add(y);
  set.add(currentYear());
  if (isYear(selected)) set.add(selected);
  return [...set].sort((a, b) => b.localeCompare(a));
}

/** Every year from the oldest row to this one, so the picker has no holes. */
export function yearSpan(oldest: string | null | undefined): string[] {
  const now = Number(currentYear());
  const first = isYear(oldest?.slice(0, 4)) ? Number(oldest!.slice(0, 4)) : now;
  const out: string[] = [];
  for (let y = Math.min(first, now); y <= now; y++) out.push(String(y));
  return out;
}

/** How the selected window reads inside a sentence. */
export function yearWindowLabel(year: string): string {
  return year === ALL ? ALL_TIME_NOTE : year;
}
