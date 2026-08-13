// One slug generator for people, so every path that inserts into team_members
// produces a value the column's own check constraint accepts:
//
//   slug text not null unique check (slug ~ '^[a-z][a-z0-9-]*$')
//
// Note the FIRST character must be a letter — a name starting with a digit
// ("2Fast Krasniqi") would otherwise pass a naive slugifier and be rejected by
// Postgres.

/** Albanian letters NFKD does not decompose the way we need. */
const LETTER_MAP: Record<string, string> = {
  "ë": "e", "Ë": "e",
  "ç": "c", "Ç": "c",
};

/**
 * "Qëndrim Pllana" → "qendrim-pllana". Returns "" only for input with no
 * usable characters at all; callers must handle that.
 */
export function slugify(input: string): string {
  const mapped = (input ?? "").replace(/[ëËçÇ]/g, (c) => LETTER_MAP[c] ?? c);
  return mapped
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")  // strip leftover combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Same, but guaranteed to satisfy `^[a-z][a-z0-9-]*$`: a slug that would start
 * with a digit is prefixed, and an empty result falls back to `fallback`.
 */
export function slugifyName(input: string, fallback = "anetar"): string {
  let s = slugify(input);
  if (!s) s = fallback;
  if (!/^[a-z]/.test(s)) s = `p-${s}`.slice(0, 60).replace(/-+$/, "");
  return s;
}

/**
 * First free slug in the `base`, `base-2`, `base-3` … series.
 * `exists` reports whether a candidate is taken.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxTries = 200,
): Promise<string> {
  let candidate = base;
  for (let n = 2; n <= maxTries; n++) {
    if (!(await exists(candidate))) return candidate;
    candidate = `${base}-${n}`;
  }
  // Practically unreachable; a timestamp suffix still satisfies the constraint.
  return `${base}-${Date.now().toString(36)}`;
}

/** "Qëndrim Osmani Pllana" → { first: "Qëndrim", last: "Osmani Pllana" }.
 * first_name / last_name / full_name are all NOT NULL, so a single-token name
 * repeats the token rather than writing an empty string. */
export function splitName(fullName: string): { first: string; last: string; full: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", full: "" };
  const first = parts[0];
  const last = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  return { first, last, full: parts.join(" ") };
}
