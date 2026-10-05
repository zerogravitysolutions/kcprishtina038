export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export function isBloodGroup(value: unknown): value is BloodGroup {
  return typeof value === "string" && BLOOD_GROUPS.some((group) => group === value);
}
