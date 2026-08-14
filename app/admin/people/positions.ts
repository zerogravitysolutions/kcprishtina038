// Roster positions in Albanian, and the position an account gets when it is
// first put on the roster.
//
// Shared by the list, the confirm dialog and the server action so the sentence
// the admin reads ("shtohet si …") can never disagree with the row that is
// actually inserted. Values are the real public.team_position enum members —
// see 20260517000015_team_members.sql plus the two follow-ups that added
// board_member and the secretaries.

import type { TeamPosition } from "@/lib/supabase/types";

export const POSITION_LABEL: Record<string, string> = {
  president: "Kryetar",
  board_member: "Anëtar bordi",
  secretary_general: "Sekretar i përgjithshëm",
  secretary_organizational: "Sekretar organizativ",
  commissaire: "Komisar",
  coach: "Trajner",
  rider: "Çiklist/e",
  mechanic: "Mekanik",
  physio: "Fizioterapist",
  staff: "Staf",
};

/**
 * Starting position for an account being added to the roster.
 *
 * A coach is a coach. An admin / editor / staff account belongs to somebody who
 * runs the club, not to a cyclist: giving them 'rider' would list them under
 * "Çiklistët" on the public page AND drop them into the coach's athlete picker,
 * which is wrong twice. Only a plain member starts as a rider — which is what
 * makes them trainable. Any of it is one click to change under "Ndrysho".
 */
export function startingPosition(role: string): TeamPosition {
  if (role === "coach") return "coach";
  if (role === "admin" || role === "editor" || role === "staff") return "staff";
  return "rider";
}
