// UCI age-category resolution from DOB. Single source of truth used on
// the public /team pages AND the admin members pages so the displayed
// category is consistent everywhere.
//
// Bracket (per Kosovan cycling convention, FÇK):
//   <15        Kadet
//   15–16      Junior
//   17–18      U19
//   19–22      U23
//   23–29      Elite
//   30+        Master
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
  /** Age in the reference year (defaults to current calendar year). */
  age: number;
  isMaster: boolean;
};

function codeForAge(age: number): UciCategoryCode {
  if (age < 15)  return "Kadet";
  if (age < 17)  return "Junior";
  if (age < 19)  return "U19";
  if (age < 23)  return "U23";
  if (age < 30)  return "Elite";
  return "Master";
}

/**
 * Resolve a UCI category from a DOB string (`YYYY-MM-DD` or anything
 * `Date` can parse) and gender. The `refYear` defaults to the current
 * calendar year.
 */
export function getUciCategory(
  dob: string | Date | null | undefined,
  gender: Gender | null | undefined = "m",
  refYear?: number,
): UciCategory | null {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const year = refYear ?? new Date().getFullYear();
  const age = year - d.getFullYear();
  if (age < 0 || age > 120) return null;

  const code = codeForAge(age);
  const label = gender === "f" ? `${code} Femra` : code;

  return { code, label, age, isMaster: code === "Master" };
}

/**
 * Just the short label (e.g. "Master", "Elite Femra"). Convenient
 * when you only need the string for badges/chips.
 */
export function uciCategoryLabel(
  dob: string | Date | null | undefined,
  gender: Gender | null | undefined = "m",
  refYear?: number,
): string | null {
  return getUciCategory(dob, gender, refYear)?.label ?? null;
}
