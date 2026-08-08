// UCI-style category eligibility. "Category age" = race year − birth year,
// which is how federations bucket riders for a given season.

export type Gender = "m" | "f" | "other";

// Categories are unisex — gender is captured separately on the signup form
// (so an "Elite" startlist is then split into M / F for ranking purposes).
export const CATEGORIES = [
  { v: "elite",    label: "Elite",       gender: null, min: 19, max: null },
  { v: "u23",      label: "U23",         gender: null, min: 19, max: 22 },
  { v: "junior",   label: "Junior",      gender: null, min: 17, max: 18 },
  { v: "youth",    label: "Youth/Kadet", gender: null, min: 13, max: 16 },
  { v: "masters",  label: "Masters",     gender: null, min: 30, max: null },
  { v: "amateur",  label: "Amator",      gender: null, min: null, max: null },
] as const;

export type CategoryDef = (typeof CATEGORIES)[number];

/** Category age per UCI: race-year minus birth-year. */
export function categoryAge(dobIso: string, raceIso: string): number | null {
  const dob = new Date(dobIso);
  const race = new Date(raceIso);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(race.getTime())) return null;
  return race.getFullYear() - dob.getFullYear();
}

export function eligibleCategories(
  dobIso: string | null,
  raceIso: string | null,
  gender: Gender | null,
): CategoryDef[] {
  const age = dobIso && raceIso ? categoryAge(dobIso, raceIso) : null;
  return CATEGORIES.filter((c) => {
    if (c.gender && gender && c.gender !== gender) return false;
    if (age == null) return true;
    if (c.min != null && age < c.min) return false;
    if (c.max != null && age > c.max) return false;
    return true;
  });
}

export function validateCategoryChoice({
  category, dobIso, raceIso, gender,
}: {
  category: string;
  dobIso: string | null;
  raceIso: string | null;
  gender: Gender | null;
}): { ok: true } | { ok: false; error: string } {
  if (!category) return { ok: true }; // optional
  const def = CATEGORIES.find((c) => c.v === category);
  if (!def) return { ok: false, error: "Kategoria nuk është e vlefshme." };
  if (def.gender && gender && def.gender !== gender) {
    return {
      ok: false,
      error: `Kategoria "${def.label}" është vetëm për ${def.gender === "m" ? "meshkuj" : "femra"}.`,
    };
  }
  if (dobIso && raceIso) {
    const age = categoryAge(dobIso, raceIso);
    if (age != null) {
      if (def.min != null && age < def.min) {
        return { ok: false, error: `Kategoria "${def.label}" kërkon moshën ${def.min} vjeç e lart (gjatë vitit të garës). Mosha jote e kategorisë: ${age}.` };
      }
      if (def.max != null && age > def.max) {
        return { ok: false, error: `Kategoria "${def.label}" është për moshat ${def.min}–${def.max} vjeç. Mosha jote e kategorisë: ${age}.` };
      }
    }
  }
  return { ok: true };
}
