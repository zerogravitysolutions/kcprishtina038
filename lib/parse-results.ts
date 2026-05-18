// Tolerant parser for race result_summary strings that come out of FB
// posts with mixed formatting:
//
//   "Albion Ymerit - vendi i 3të Arber Xhemajli – vendi 11 Fuad Bajrami …"
//
// Returns rows like { name, place, raw }. If the input is free-form and
// no rows can be parsed, returns []  — caller should fall back to plain
// text rendering.

export type ParsedResult = {
  /** Cyclist name as it appears in the source. */
  name: string;
  /** Numeric place (1, 11, 17, …). Highest priority for sorting. */
  place: number;
  /** Display label e.g. "1", "11", "3të" (kept for the rare "vendi i 3të"). */
  label: string;
};

/**
 * Splits a free-form result summary into structured rows.
 *
 * Recognized shape per row:
 *   <Name>[<space>]( - | – | — | : )[<space>]vendi[<space>i[<space>]]?<number><suffix?>
 * The separator can be hyphen / en-dash / em-dash / colon.
 * Numbers can have Albanian ordinal suffixes (1rë, 2të, 3të, etc.).
 */
export function parseResults(input: string | null | undefined): ParsedResult[] {
  if (!input) return [];
  // Normalize whitespace so "  vendi   11" still matches.
  const text = input.replace(/ /g, " ").replace(/\s+/g, " ").trim();

  // Pattern: name (up to 60 chars, letters / spaces / apostrophes / hyphens)
  // then dash, then "vendi (i)? N (suffix)?"
  const re = /([A-ZÇËĞŠŽÁÉÍÓÚÝa-zçëğšžáéíóúýßÀ-ÿ][A-ZÇËĞŠŽÁÉÍÓÚÝa-zçëğšžáéíóúýßÀ-ÿ'’\- ]{2,59}?)\s*[-–—:]\s*vendi(?:\s+i)?\s*(\d{1,3})(rë|të|tët|t|ti)?\b/gi;

  const out: ParsedResult[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    const num = parseInt(m[2], 10);
    const suffix = m[3] ?? "";
    if (!Number.isFinite(num)) continue;
    out.push({
      name,
      place: num,
      label: suffix ? `${num}${suffix}` : String(num),
    });
  }
  return out;
}
