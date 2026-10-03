/**
 * Words this screen uses where a value is missing.
 *
 * A PLAIN module on purpose. page.tsx is a Server Component and imports
 * UNKNOWN_DATE_LABEL as a VALUE; a value exported from a "use client" file
 * reaches the server as a client-reference proxy, and every comparison against
 * it silently reads false. Keep this file free of "use client".
 *
 * lib/finance's formatDate() renders an em dash for a date it cannot parse.
 * A dash is not a sentence — on this screen a broken date says so in words,
 * with the SAME words the month grouping uses for the same rows, so a row filed
 * under "Datë e panjohur" in the list does not call itself "—" in the detail.
 */
import { formatDate } from "@/lib/finance";

export const UNKNOWN_DATE_LABEL = "Datë e panjohur";

/** "2026-08-14" → "14.8.2026"; anything unparseable → "Datë e panjohur". */
export function dateLabel(value: string | null | undefined): string {
  const d = formatDate(value);
  return d === "—" ? UNKNOWN_DATE_LABEL : d;
}

/**
 * The academy as an expense source. It shares the sponsor <select> and the
 * `sp` filter, so it needs a value no sponsor uuid can ever equal.
 */
export const ACADEMY_SOURCE = "academy";
export const ACADEMY_SOURCE_LABEL = "Nga Akademia";

/** The source line for one expense, or null when it has none. */
export function sourceLabel(
  e: { funded_by_academy?: boolean | null; funding_sponsor_id: string | null; funding_fund_id?: string | null },
  sponsorName: (id: string) => string,
  fundTitle: (id: string) => string,
): string | null {
  if (e.funded_by_academy) return ACADEMY_SOURCE_LABEL;
  if (e.funding_fund_id) return fundTitle(e.funding_fund_id);
  return e.funding_sponsor_id ? `${sponsorName(e.funding_sponsor_id)} (pa hyrje)` : null;
}
