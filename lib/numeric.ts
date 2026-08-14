/**
 * Numeric form fields, app-wide.
 *
 * Every field that expects a number is type="text" + inputMode (see
 * components/admin/NumericInput.tsx), never type="number":
 *  - type="number" REJECTS the "," decimal separator the Albanian phone
 *    keyboard produces — the browser hands back an empty string, so "42,5"
 *    silently stores nothing;
 *  - it changes value on a desktop scroll wheel over a focused field;
 *  - its min/max only ever run on a native form submit anyway.
 *
 * Dropping type="number" means ANY character can now reach the server, so the
 * bound the browser used to hint at has to be enforced here instead — with an
 * Albanian sentence, not a Postgres violation. parseNumField() is that check.
 */

import { UserError } from "@/lib/errors";
import { normalizeDecimal, parseStrictNumber } from "@/lib/training";

export { normalizeDecimal, parseStrictNumber };

export type NumFieldOpts = {
  /** Albanian field name, capitalised — it starts the error sentence. */
  label: string;
  /** "int" rounds nothing: a fraction is an error, so 1.5 cannot become 2. */
  kind?: "int" | "decimal";
  min?: number;
  max?: number;
};

/**
 * `display_order` on sections, sponsors, event sponsors, races, team members
 * and documents — the same column, the same message, everywhere.
 */
export const ORDER_FIELD: NumFieldOpts = { label: "Renditja", kind: "int", min: 0, max: 100000 };

/**
 * Parse one numeric form value.
 *
 * Returns `null` for a missing or blank field (every numeric field in this app
 * is optional; the required ones are checked by their own call site), and
 * throws an Albanian Error for anything that is not a number in range.
 *
 * parseStrictNumber, not parseFloat: "42..5", "1.234.5", "650m", "1e3" and
 * "Infinity" all come back from parseFloat as a plausible-looking number, and
 * every one of them would be silently wrong in the database.
 */
export function parseNumField(
  raw: FormDataEntryValue | string | null | undefined,
  { label, kind = "decimal", min, max }: NumFieldOpts,
): number | null {
  if (raw === null || raw === undefined) return null;
  const s = normalizeDecimal(String(raw));
  if (s === "") return null;
  const n = parseStrictNumber(s);
  if (n === null) throw new UserError(`${label} duhet të jetë numër.`);
  if (kind === "int" && !Number.isInteger(n)) throw new UserError(`${label} duhet të jetë numër i plotë.`);
  if (min != null && n < min) throw new UserError(`${label} nuk mund të jetë më e vogël se ${min}.`);
  if (max != null && n > max) throw new UserError(`${label} nuk mund të jetë më e madhe se ${max}.`);
  return n;
}

/**
 * The same rules as a boolean-ish check, for a client component that wants to
 * show the precise sentence BEFORE calling the action — React masks whatever a
 * Server Action throws in a production build, so the server copy of the check
 * is the guard and this one is the message.
 *
 * Returns null when the value is acceptable.
 */
export function numFieldError(
  raw: FormDataEntryValue | string | null | undefined,
  opts: NumFieldOpts,
): string | null {
  try {
    parseNumField(raw, opts);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : `${opts.label} duhet të jetë numër.`;
  }
}

/**
 * Pre-flight for a `<form onSubmit>` that hands its FormData to a server
 * action: the first Albanian complaint, or null when every field is fine.
 */
export function formNumError(
  form: FormData,
  specs: ({ name: string } & NumFieldOpts)[],
): string | null {
  for (const { name, ...opts } of specs) {
    const msg = numFieldError(form.get(name), opts);
    if (msg) return msg;
  }
  return null;
}
