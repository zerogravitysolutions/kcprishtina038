import type { StravaActivity } from "./strava-api";

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function suggestedFocus(activities: StravaActivity[]): string {
  const names = activities.map((activity) => activity.name.toLowerCase());
  const clues: { pattern: RegExp; focus: string }[] = [
    { pattern: /recovery|rikuper|regener/, focus: "Recovery (Z1)" },
    { pattern: /interval|hiit/, focus: "Intervale (HIIT)" },
    { pattern: /threshold|ftp|prag/, focus: "Threshold" },
    { pattern: /sweet spot/, focus: "Sweet Spot" },
    { pattern: /sprint|anaerob/, focus: "Anaerobic & Sprint" },
    { pattern: /climb|hill|ngjit|kodr/, focus: "Climbing" },
    { pattern: /tempo/, focus: "Tempo (Z3)" },
    { pattern: /endurance|base|z2|qëndrueshm/, focus: "Endurance (Z2)" },
    { pattern: /long ride|gran fondo/, focus: "Long Ride" },
    { pattern: /race|gara|garë/, focus: "Garë / Simulim" },
  ];
  for (const clue of clues) {
    if (names.filter((name) => clue.pattern.test(name)).length >= Math.ceil(names.length / 2)) return clue.focus;
  }
  return "Dalje grupore";
}

export function suggestedTitle(activities: StravaActivity[], rideDate: string): string {
  const names = activities.map((activity) => activity.name.trim());
  const first = names[0];
  if (first && first.length <= 120 && names.every((name) => name.toLowerCase() === first.toLowerCase())) return first;
  return `Dalje grupore · ${rideDate}`;
}
