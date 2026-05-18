// UCI age-category resolution from DOB. Single source of truth used on
// the public /team pages AND the admin members pages so the displayed
// category is consistent everywhere.
//
// Auto-derived bracket from age (per Kosovan cycling convention, FÇK):
//   <15    Kadet
//   15–16  Junior
//   17–18  U19
//   19–22  U23
//   23+    Elite
//
// Master is NOT auto-derived. An admin sets `is_master` on a team
// member only when that rider actually registers in the federation's
// Master category. The auto-derived label stays Elite until that
// happens.
//
// Category for season Y is determined by age the rider TURNS in Y
// (calendar year, not the date of birth).
// Women get a "Femra" suffix on the label. The code stays the same.

export type UciCategoryCode =
  | "Kadet" | "Junior" | "U19" | "U23" | "Elite" | "Master";

export type Gender = "m" | "f";

export type UciCategory = {
  code: UciCategoryCode;
  /** Display label in Albanian, with Femra suffix when gender='f'. */
  label: string;
  /** Age in the reference year (defaults to current calendar year).
   *  Kept on the return value for admin-side use only — public pages
   *  intentionally display the category label and never the age. */
  age: number;
  /** True when the label came from the admin-set is_master override
   *  rather than the auto-derived age bracket. */
  isMaster: boolean;
};

function codeForAge(age: number): UciCategoryCode {
  if (age < 15)  return "Kadet";
  if (age < 17)  return "Junior";
  if (age < 19)  return "U19";
  if (age < 23)  return "U23";
  return "Elite";
}

type Opts = {
  /** Admin-set override; when true, label becomes "Master"/"Master Femra"
   *  regardless of the rider's age. */
  isMaster?: boolean | null;
  /** Reference year for the age calculation (default: current year). */
  refYear?: number;
};

/**
 * Resolve a UCI category from a DOB string (`YYYY-MM-DD` or anything
 * `Date` can parse) and gender.
 */
export function getUciCategory(
  dob: string | Date | null | undefined,
  gender: Gender | null | undefined = "m",
  opts: Opts | number = {},
): UciCategory | null {
  // Back-compat: callers used to pass refYear as a third positional arg.
  const o: Opts = typeof opts === "number" ? { refYear: opts } : opts;

  if (!dob) {
    if (o.isMaster) {
      const label = gender === "f" ? "Master Femra" : "Master";
      return { code: "Master", label, age: 0, isMaster: true };
    }
    return null;
  }
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const year = o.refYear ?? new Date().getFullYear();
  const age = year - d.getFullYear();
  if (age < 0 || age > 120) return null;

  const code: UciCategoryCode = o.isMaster ? "Master" : codeForAge(age);
  const label = gender === "f" ? `${code} Femra` : code;

  return { code, label, age, isMaster: code === "Master" };
}

/**
 * Just the short label (e.g. "Elite", "U23 Femra", "Master").
 */
export function uciCategoryLabel(
  dob: string | Date | null | undefined,
  gender: Gender | null | undefined = "m",
  opts: Opts | number = {},
): string | null {
  return getUciCategory(dob, gender, opts)?.label ?? null;
}
