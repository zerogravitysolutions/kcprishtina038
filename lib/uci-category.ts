// UCI age-category resolution from DOB. Single source of truth used on
// the public /team pages AND the admin members pages so the displayed
// category is consistent everywhere.
//
// Rules (from UCI cycling regs, adopted by FÇK in Kosovo):
//   * Category for season Y is determined by age the rider TURNS in Y
//     (calendar year, not at the date of birth).
//   * Bands:
//       <13          Youth U13      ("U13")
//       13–14        Youth U15      ("U15")
//       15–16        Youth U17      ("U17")
//       17–18        Junior         ("Junior")
//       19–22        Under-23       ("U23")
//       23–29        Elite          ("Elite")
//       30–34        Masters M30
//       35–39        Masters M35
//       40–44        Masters M40
//       45–49        Masters M45
//       50–54        Masters M50
//       55–59        Masters M55
//       60+          Masters M60+
//   * Women: a "Femra" suffix is appended to the label (the code stays
//     the same). Albanian convention.

export type UciCategoryCode =
  | "U13" | "U15" | "U17" | "Junior" | "U23" | "Elite"
  | "M30" | "M35" | "M40" | "M45" | "M50" | "M55" | "M60+";

export type Gender = "m" | "f";

export type UciCategory = {
  code: UciCategoryCode;
  /** Display label in Albanian, with Femra suffix when gender='f'. */
  label: string;
  /** Age in the reference year (defaults to current calendar year). */
  age: number;
  /** Whether this rider is in the Masters bracket. */
  isMasters: boolean;
};

function codeForAge(age: number): UciCategoryCode {
  if (age < 13)  return "U13";
  if (age < 15)  return "U15";
  if (age < 17)  return "U17";
  if (age < 19)  return "Junior";
  if (age < 23)  return "U23";
  if (age < 30)  return "Elite";
  if (age < 35)  return "M30";
  if (age < 40)  return "M35";
  if (age < 45)  return "M40";
  if (age < 50)  return "M45";
  if (age < 55)  return "M50";
  if (age < 60)  return "M55";
  return "M60+";
}

function baseLabel(code: UciCategoryCode): string {
  if (code === "Elite")  return "Elite";
  if (code === "U23")    return "U23";
  if (code === "Junior") return "Junior";
  if (code.startsWith("U")) return `Youth ${code}`;
  // Masters
  return `Masters ${code}`;
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
  const base = baseLabel(code);
  const label = gender === "f" ? `${base} Femra` : base;

  return {
    code,
    label,
    age,
    isMasters: code.startsWith("M"),
  };
}

/**
 * Just the short label (e.g. "Masters M30", "Elite Femra"). Convenient
 * when you only need the string for badges/chips.
 */
export function uciCategoryLabel(
  dob: string | Date | null | undefined,
  gender: Gender | null | undefined = "m",
  refYear?: number,
): string | null {
  return getUciCategory(dob, gender, refYear)?.label ?? null;
}
