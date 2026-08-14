"use server";

// The two actions that close the gap between the club's two identity tables.
//
// They do NOT replace anything: account operations still live in
// app/admin/actions.ts (admin only) and roster editing still lives in
// app/admin/team-members/actions.ts (admin + editor). What is new is the pair
// of "give this person the facet they are missing" operations that the merged
// /admin/people list offers per row:
//
//   roster row without an account  → createAccountForPerson()  (admin)
//   account without a roster row   → addToRoster()             (admin + editor)
//
// Gates come from app/admin/guards.ts — the same functions the old, separate
// pages used. Nothing here widens a role.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "@/lib/errors";
import type { TableUpdate, UserRole } from "@/lib/supabase/types";
import { requireAdmin, requireEditor } from "../guards";
import { slugifyName, splitName, uniqueSlug } from "@/lib/slug";
import { startingPosition } from "./positions";

// Typed against the column union so a role removed from the enum is a compile
// error here rather than a runtime 22P02 from Postgres.
const MEMBER_ROLES: readonly UserRole[] = ["admin", "editor", "staff", "coach", "member"];

function refresh() {
  revalidatePath("/admin/people");
  revalidatePath("/admin/dashboard");
  revalidatePath("/team");
}

// ---------------------------------------------------------------- roster → account

type RosterIdentity = {
  id: string;
  full_name: string;
  profile_id: string | null;
  dob: string | null;
  section_slug: string | null;
};

/**
 * Give a roster person a login: create the auth user, promote the profile the
 * handle_new_user trigger inserts, and link it back through
 * team_members.profile_id so the person stays ONE person on the merged list.
 *
 * When the email already has an account we link that instead of failing —
 * "this person already exists as a login" is exactly the case this screen is
 * meant to resolve.
 */
export async function createAccountForPerson(input: {
  teamMemberId: string;
  email: string;
  password: string;
  role: string;
}): Promise<{ ok: boolean; error?: string; linked?: boolean }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  // find() rather than includes() so `role` narrows to UserRole.
  const role = MEMBER_ROLES.find((r) => r === input.role) ?? "member";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }

  const { data: tmData, error: tmErr } = await admin
    .from("team_members")
    .select("id, full_name, profile_id, dob, section_slug")
    .eq("id", input.teamMemberId)
    .maybeSingle();
  if (tmErr) return { ok: false, error: dbError(tmErr, "Leximi i personit dështoi. Provo sërish.") };
  const person = tmData as RosterIdentity | null;
  if (!person) return { ok: false, error: "Personi nuk u gjet. Rifresko faqen." };
  if (person.profile_id) return { ok: false, error: "Ky person ka tashmë një llogari të lidhur. Rifresko faqen." };

  const fullName = (person.full_name ?? "").trim();

  // An account for this email may already exist (someone applied, or an admin
  // created it by hand). Link it rather than refusing.
  const { data: byEmail } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const existingId = (byEmail as { id: string } | null)?.id ?? null;

  let memberId: string;
  let linked = false;
  if (existingId) {
    // Linking is only safe if that account is not already somebody's roster
    // row: team_members.profile_id has no unique index, so two rows could end
    // up sharing one login and the merged list would fold two humans into one.
    const { data: taken } = await admin
      .from("team_members").select("id, full_name").eq("profile_id", existingId).limit(1);
    const owner = ((taken as { id: string; full_name: string }[] | null) ?? [])[0];
    if (owner && owner.id !== person.id) {
      return { ok: false, error: `Ky email është i lidhur tashmë me “${owner.full_name}” në ekip. Përdor një email tjetër.` };
    }
    memberId = existingId;
    linked = true;
  } else {
    if (password.length < 8) return { ok: false, error: "Fjalëkalimi duhet të ketë së paku 8 karaktere." };
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (cErr || !created?.user) {
      const msg = cErr?.message ?? "";
      if (/already been registered|already registered|exists/i.test(msg)) {
        return { ok: false, error: "Ky email ka tashmë një llogari që nuk u gjet në profile. Kontakto administratorin." };
      }
      return { ok: false, error: dbError(cErr, "Krijimi i llogarisë dështoi.") };
    }
    memberId = created.user.id;

    // handle_new_user already inserted a 'member' / 'pending' profile — promote it.
    const patch: TableUpdate<"profiles"> = {
      full_name: fullName,
      role,
      status: "active",
      joined_at: new Date().toISOString().slice(0, 10),
    };
    if (person.dob) patch.dob = person.dob;
    const { error: uErr } = await admin.from("profiles").update(patch).eq("id", memberId);
    if (uErr) return { ok: false, error: dbError(uErr, "Llogaria u krijua, por profili s’u përditësua.") };
  }

  const { error: linkErr } = await admin.from("team_members").update({ profile_id: memberId }).eq("id", person.id);
  if (linkErr) {
    return {
      ok: false,
      error: dbError(linkErr, "Llogaria u krijua, por nuk u lidh me personin. Lidhe me dorë te “Ndrysho”."),
    };
  }

  refresh();
  return { ok: true, linked };
}

// ---------------------------------------------------------------- account → roster

type ProfileIdentity = {
  id: string;
  full_name: string;
  role: string;
  dob: string | null;
  section_id: string | null;
};

/**
 * Put an account holder on the public roster and link the two rows.
 *
 * Idempotent: if the profile already owns a team_members row we return ok
 * without touching anything, and an UNLINKED roster row with exactly the same
 * name is linked instead of being duplicated.
 *
 * Runs through the caller's own session, so RLS
 * (team_members_write_admin = admin|editor) is the second gate.
 */
export async function addToRoster(profileId: string): Promise<{ ok: boolean; error?: string; linked?: boolean }> {
  const gate = await requireEditor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();

  const { data: pData, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, dob, section_id")
    .eq("id", profileId)
    .maybeSingle();
  if (pErr) return { ok: false, error: dbError(pErr, "Leximi i llogarisë dështoi. Provo sërish.") };
  const profile = pData as ProfileIdentity | null;
  if (!profile) return { ok: false, error: "Llogaria nuk u gjet. Rifresko faqen." };

  // Already on the roster — nothing to do (double click, or a stale page).
  const { data: already } = await supabase.from("team_members").select("id").eq("profile_id", profileId).limit(1);
  if (((already as { id: string }[] | null) ?? []).length > 0) return { ok: true, linked: true };

  const { first, last, full } = splitName(profile.full_name);
  if (!first || !last) return { ok: false, error: "Kjo llogari nuk ka emër të plotë. Plotësoje së pari emrin." };

  // An unlinked roster row for the same person (added by hand before the
  // account existed). Link it instead of creating a second row for one human.
  const { data: sameName } = await supabase
    .from("team_members")
    .select("id")
    .is("profile_id", null)
    .ilike("full_name", full)
    .limit(2);
  const candidates = (sameName as { id: string }[] | null) ?? [];
  if (candidates.length === 1) {
    const { error } = await supabase.from("team_members").update({ profile_id: profileId }).eq("id", candidates[0].id);
    if (error) return { ok: false, error: dbError(error, "Lidhja me rreshtin e ekipit dështoi. Provo sërish.") };
    refresh();
    return { ok: true, linked: true };
  }

  // section_slug is text on the roster but a uuid FK on the profile.
  let sectionSlug: string | null = null;
  if (profile.section_id) {
    const { data: sec } = await supabase.from("sections").select("slug").eq("id", profile.section_id).maybeSingle();
    sectionSlug = (sec as { slug: string } | null)?.slug ?? null;
  }

  const base = slugifyName(full);
  const slug = await uniqueSlug(base, async (candidate) => {
    const { data } = await supabase.from("team_members").select("id").eq("slug", candidate).maybeSingle();
    return !!data;
  });

  const { error } = await supabase.from("team_members").insert([{
    slug,
    full_name: full,
    first_name: first,
    last_name: last,
    dob: profile.dob,
    positions: [startingPosition(profile.role)],
    section_slug: sectionSlug,
    status: "active",
    profile_id: profileId,
  }]);
  if (error) return { ok: false, error: dbError(error, "Shtimi në ekip dështoi. Provo sërish.") };

  refresh();
  return { ok: true, linked: false };
}
