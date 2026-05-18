// Heuristic detector for "this news post is reporting on a race".
//
// Used to surface a "Krijo garë nga ky postim" suggestion on the admin
// news edit page. We deliberately bias toward false positives — better
// to show the prompt once for a non-race post than miss a real race.
// The admin still has to click to create the race entry, so wrong
// suggestions don't pollute /races.

const STRONG_PHRASES = [
  // Albanian
  "kampionat", "kampionati", "kampionatit",
  "kupa ", "kupës", "kupën", "kupa e",
  "trofeu", "trofeun", "trofeut",
  "garë", "gara", "garën", "garën ndërkombëtare", "garën rrugore",
  "kronometër", "kronometr", "krono individu",
  "tour of", "grand prix",
  // Format hints
  "cross country", "xco", "maratonë",
  // Results signals
  "vendi i parë", "vendi i dytë", "vendi i tretë",
  "fitues i", "fituar", "fitoj",
  "podiumit", "medalje", "medaljen e", "argjend", "bronz",
  "🥇", "🥈", "🥉",
];

const ORGANIZER_HINTS = ["fçk", "uci", "ecu", "federata e çiklizmit", "federatë"];

export type RaceSignal = {
  likely: boolean;
  /** Strong phrases that matched, deduplicated and lowercased. */
  matches: string[];
  /** Best-guess race name extracted from quoted phrases or title-like
   *  fragments in the text, when one is obvious. */
  nameGuess: string | null;
  /** Score 0–10. ≥3 is considered race-like. */
  score: number;
};

const QUOTED = /[„"“'`]\s*([^"„“'`\n]{6,80})\s*[„"“'`]/g;

function pickNameGuess(text: string): string | null {
  // Prefer quoted phrases — they usually carry the race name.
  let best: string | null = null;
  const candidates: string[] = [];
  for (const m of text.matchAll(QUOTED)) {
    candidates.push(m[1].trim());
  }
  // Sort by length descending — longest quoted phrase wins.
  candidates.sort((a, b) => b.length - a.length);
  if (candidates.length > 0) best = candidates[0];

  // Fallback: a leading capitalized phrase like "Kupa e Mitrovicës 2024"
  // or "Cross Country Prishtina 2023".
  if (!best) {
    const m = text.match(/\b((?:Kupa|Trofeu|Kampionati|Cross Country|Tour of|Grand Prix)[\w \-’'.]{3,60}\d{4})\b/);
    if (m) best = m[1].trim();
  }

  return best;
}

export function detectRaceSignal(input: { title?: string; body?: string } | null | undefined): RaceSignal {
  const text = `${input?.title ?? ""}\n${input?.body ?? ""}`.trim();
  if (!text) return { likely: false, matches: [], nameGuess: null, score: 0 };

  const t = text.toLowerCase();
  const matches = new Set<string>();
  let score = 0;

  for (const p of STRONG_PHRASES) {
    if (t.includes(p)) {
      matches.add(p);
      score += 1;
    }
  }
  for (const h of ORGANIZER_HINTS) {
    if (t.includes(h)) score += 1;
  }
  // Quoted race name? bonus.
  const nameGuess = pickNameGuess(text);
  if (nameGuess) score += 2;
  // Short posts rarely report races; penalize.
  if (text.length < 180) score -= 2;

  return {
    likely: score >= 3,
    matches: Array.from(matches),
    nameGuess,
    score,
  };
}
