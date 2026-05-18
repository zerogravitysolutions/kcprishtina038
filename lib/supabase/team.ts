// Server-side data helpers for the public /team pages.
// Uses the same Supabase client as everything else (cookie-aware,
// works with RLS — team_members has public-select policy).

import { createClient } from "./server";
import { mediaUrl } from "./fb";

export type TeamPosition =
  | "president" | "board_member"
  | "secretary_general" | "secretary_organizational"
  | "commissaire" | "coach"
  | "rider" | "mechanic" | "physio" | "staff";

export type TeamGender = "m" | "f";

export type TeamMemberCard = {
  id: string;
  slug: string;
  full_name: string;
  first_name: string;
  last_name: string;
  gender: TeamGender | null;
  dob: string | null;          // ISO date; used only for category derivation
  positions: TeamPosition[];
  section_slug: string | null;
  bio: string | null;
  status: "active" | "past";
  ended_at: string | null;
  display_order: number;
  external_photo_url: string | null;
  is_master: boolean;          // admin-set override; promotes Elite → Master
  photo: { storage_path: string } | null;
};

const CARD_SELECT =
  "id, slug, full_name, first_name, last_name, gender, dob, " +
  "positions, section_slug, bio, status, ended_at, display_order, " +
  "external_photo_url, is_master, " +
  "photo:media!photo_media_id(storage_path)";

export async function getTeamMembers(status: "active" | "past" = "active"): Promise<TeamMemberCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select(CARD_SELECT)
    .eq("status", status)
    .order("display_order")
    .order("last_name");
  return (data as unknown as TeamMemberCard[] | null) ?? [];
}

export async function getTeamMemberBySlug(slug: string): Promise<TeamMemberCard | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select(CARD_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as TeamMemberCard | null) ?? null;
}

// Helpers for display

export function positionLabel(pos: TeamPosition, gender: TeamGender | null = "m"): string {
  switch (pos) {
    case "president":                return "Kryetar";
    case "board_member":             return "Anëtar Bordi";
    case "secretary_general":        return "Sekretar i Përgjithshëm";
    case "secretary_organizational": return "Sekretar Organizativ";
    case "commissaire":              return "Komisar";
    case "coach":                    return "Trajner";
    case "rider":                    return gender === "f" ? "Çikliste" : "Çiklist";
    case "mechanic":                 return "Mekanik";
    case "physio":                   return "Fizioterapist";
    case "staff":                    return "Staf";
  }
}

export function memberRoleSummary(m: TeamMemberCard): string {
  // For display chips: comma-joined position labels.
  return m.positions.map((p) => positionLabel(p, m.gender)).join(" · ");
}

export function memberPhotoUrl(m: TeamMemberCard): string | null {
  // Prefer the locally-stored media; fall back to external URL only if
  // it's a direct image URL (not a Drive viewer page which won't render).
  const local = mediaUrl(m.photo?.storage_path ?? null);
  if (local) return local;
  // Drive `/file/d/<id>/view` is a viewer page, not the file — useless
  // for <img>. Don't return it.
  return null;
}

// Initials for the avatar placeholder.
export function memberInitials(m: TeamMemberCard): string {
  const a = (m.first_name || "")[0] || "";
  const b = (m.last_name || "")[0] || "";
  return (a + b).toUpperCase() || "?";
}
