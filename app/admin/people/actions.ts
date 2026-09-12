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
//
// The membership actions at the bottom are the third pair: MONEY, which is
// admin + staff. They carry their own gate (requireMoneyStaff, below) because
// guards.ts has no admin+staff gate and money is not roster work.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "@/lib/errors";
import type { TableUpdate, UserRole } from "@/lib/supabase/types";
import { requireAdmin, requireEditor, type Gate } from "../guards";
import { slugifyName, splitName, uniqueSlug } from "@/lib/slug";
import { startingPosition } from "./positions";
import { clubTodayISO, lastBillingRunDay } from "@/lib/clubtime";
import {
  endCutoff, endDateError, laterInvoicesOnEnd, laterInvoicesOnReopen, lostMonthsSentence, monthStartOf,
  monthsLostOnReopen, periodsAfter, planChangeCase, reopenEndOf, reopenReason, startDateError,
  type NamedInvoice,
} from "./membership";
import { formatDate } from "@/lib/finance";

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

// ============================================================ the membership
//
// A person's membership IS their payment schedule: which tier, at what price,
// starting on which DAY (the day the club bills them on, every month). Until
// now the only code in the app that could write one was enrolApplication(),
// which needs an application in status 'pending' — so an existing member could
// not be put on a plan, moved between tiers, repriced, or taken OFF the academy
// without someone opening a SQL console. These two actions are that missing
// pair, and they are the only ones on this screen that touch money.
//
// THE ROLE GATE. /admin/people is readable by admin + editor + staff (the page
// merges two old screens). Money is admin + staff, so BOTH actions below start
// with requireMoneyStaff() — a server-side check that re-reads role AND status
// on every call. An editor is refused there, by the action itself; hiding the
// button in the panel is only the courtesy. There is a second, independent gate
// in each case:
//   • setPersonMembership → set_member_plan() is SECURITY DEFINER with EXECUTE
//     revoked from anon and authenticated and granted ONLY to service_role, so
//     it MUST go through createAdminClient(). A service-role client bypasses
//     RLS by definition, which is exactly why the check above it is the real
//     one and cannot be skipped.
//   • endPersonMembership → runs on the CALLER'S OWN session, so the RLS policy
//     memberships_write_staff (admin|staff, migration 20260808000002 section I)
//     refuses an editor in SQL as well.

/**
 * Money operations: admin + staff. Same shape as the gates in guards.ts (role
 * AND status re-read per call, because a Server Action is a standalone POST and
 * the admin layout's checks never run for it) — it lives here because guards.ts
 * has no admin+staff gate and this is the only screen that needs one.
 */
async function requireMoneyStaff(): Promise<Gate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const p = data as { role: string; status: string } | null;
  if (!p || p.status !== "active") return { ok: false, error: "Llogaria jote nuk është aktive." };
  if (!["admin", "staff"].includes(p.role)) {
    return { ok: false, error: "Vetëm admini ose stafi mund ta ndryshojë anëtarësinë." };
  }
  return { ok: true, id: user.id, role: p.role };
}

function refreshMoney() {
  revalidatePath("/admin/people");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/plans");
}

type PlanRow = { id: string; name_sq: string; amount_eur: number | string | null; billable: boolean };

export type MembershipResult =
  | {
      ok: true;
      membershipId: string;
      billable: boolean;
      /** What was actually stored — 0 on a non-billable tier, whatever it was asked. */
      amountEur: number;
      startDate: string;
    }
  | {
      ok: false;
      error: string;
      /** Nothing was written: this save would CLOSE the current period and open
       * a new one (set_member_plan case 4). `error` says why, in Albanian; the
       * panel shows it as a confirmation and resubmits with confirmClose. */
      needsConfirm?: boolean;
      /** The invoiced months the warning named as left behind. The panel sends
       * them back as `acceptedLaterPeriods` with the confirmation. */
      laterPeriods?: string[];
    };

/** The months a confirmation covered, normalised to first-of-month. */
function acceptedPeriods(list: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const p of list ?? []) {
    const m = monthStartOf(p);
    if (m) out.add(m);
  }
  return out;
}

/**
 * Put a person on a plan, or change the plan / price / start date they are on.
 *
 * The WRITE is not made here and must not be: set_member_plan() owns all four
 * cases in ONE transaction (insert · identical no-op · in-place correction of
 * an uninvoiced row · close-and-open once an invoice exists), which is what
 * keeps dues.membership_id pointing at the plan and the price the invoice was
 * issued under. public.memberships is never written directly by this path.
 *
 * But the WARNING is decided here. Close-and-open is an accounting event, and
 * the panel's own prediction runs on a page snapshot that can be stale (an
 * invoice generated in another tab, the cron at 03:20). So the action re-reads
 * the active row and its dues, runs the SAME case test as the SQL
 * (planChangeCase), and refuses a case-4 save that does not carry
 * `confirmClose` — nothing is written, and the admin is told the real cause:
 * why, which months automatic billing will no longer cut (monthsLostOnReopen)
 * and which issued invoices fall inside the new period.
 *
 * The read and the RPC are separate calls, so another save, an invoice
 * generated in the meantime or the cron can turn a case-3 request into case 4
 * in between. That is closed UNDER THE LOCK: set_member_plan(p_allow_close)
 * refuses case 4 unless this action predicted it AND the admin confirmed it,
 * returning null without writing anything.
 *
 * The START DATE goes through as a real date. Its DAY is the anchor the club
 * bills on every month (generate_dues_anchored_for_date), so it is validated as
 * a calendar date against the CLUB's today and passed to p_start untouched.
 */
export async function setPersonMembership(input: {
  memberId: string;
  planId: string;
  /** Monthly amount in euro. IGNORED when the plan is not billable. */
  amountEur: number;
  /** "YYYY-MM-DD". */
  startDate: string;
  /** The admin has seen and accepted that this save closes the current period. */
  confirmClose?: boolean;
  /** Invoiced months inside the new period the admin was shown. Any other one
   * found here is asked about again. */
  acceptedLaterPeriods?: string[];
}): Promise<MembershipResult> {
  const gate = await requireMoneyStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }

  const memberId = (input.memberId ?? "").trim();
  const planId = (input.planId ?? "").trim();
  if (!memberId) return { ok: false, error: "Personi nuk u gjet. Rifresko faqen." };
  if (!planId) return { ok: false, error: "Zgjidh një plan anëtarësie." };

  // The membership hangs off profiles(id): a person with no login cannot hold
  // one, and saying so is more use than a foreign-key violation.
  const { data: memberData, error: memberErr } = await admin
    .from("profiles").select("id, full_name").eq("id", memberId).maybeSingle();
  if (memberErr) return { ok: false, error: dbError(memberErr, "Leximi i personit dështoi. Provo sërish.") };
  if (!memberData) return { ok: false, error: "Ky person nuk ka llogari, prandaj nuk mban dot anëtarësi. Krijoji llogarinë së pari." };

  const { data: planData, error: planErr } = await admin
    .from("membership_plans").select("id, name_sq, amount_eur, billable").eq("id", planId).maybeSingle();
  if (planErr) return { ok: false, error: dbError(planErr, "Leximi i planit dështoi. Provo sërish.") };
  const plan = planData as PlanRow | null;
  if (!plan) return { ok: false, error: "Plani i zgjedhur nuk u gjet. Rifresko faqen." };

  // A non-billable tier is not "€0 for now" — it is outside billing. The amount
  // the form sent is not even read, so a stale field can never bill a racer.
  // set_member_plan() forces the same thing again in SQL.
  const billable = plan.billable === true;
  let amount = 0;
  if (billable) {
    amount = Math.round(Number(input.amountEur) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Shuma mujore nuk është e vlefshme." };
    if (amount > 100000) return { ok: false, error: "Shuma mujore është shumë e madhe." };
  }

  const startDate = (input.startDate ?? "").trim();
  const startErr = startDateError(startDate, clubTodayISO());
  if (startErr) return { ok: false, error: startErr };

  // The same row set_member_plan() will lock: the member's active membership,
  // latest start first.
  const { data: currentData, error: currentErr } = await admin
    .from("memberships")
    .select("id, plan_id, amount_eur, billable, start_date")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentErr) return { ok: false, error: dbError(currentErr, "Leximi i anëtarësisë dështoi. Provo sërish.") };
  const current = currentData as
    | { id: string; plan_id: string; amount_eur: number | string; billable: boolean; start_date: string }
    | null;

  let hasInvoices = false;
  if (current) {
    // exists (select 1 from dues where membership_id = v_current.id) — the
    // exact test in the SQL, on this one row, never a capped page-wide read.
    const { data: duesData, error: duesErr } = await admin
      .from("dues").select("id").eq("membership_id", current.id).limit(1);
    if (duesErr) return { ok: false, error: dbError(duesErr, "Leximi i faturave dështoi. Provo sërish.") };
    hasInvoices = ((duesData as { id: string }[] | null) ?? []).length > 0;
  }

  const planCase = planChangeCase(current, hasInvoices, { planId: plan.id, amount, billable, startDate });
  if (planCase === "reopen" && current) {
    // Every invoice the MEMBER holds, not only this row's: the anchored job's
    // NOT EXISTS is keyed on member + period, so any of them decides what it
    // skips. One member's dues are one row a month — never a capped read.
    const { data: memberDuesData, error: memberDuesErr } = await admin
      .from("dues").select("period, invoice_no, amount_eur, status").eq("member_id", memberId).order("period");
    if (memberDuesErr) return { ok: false, error: dbError(memberDuesErr, "Leximi i faturave dështoi. Provo sërish.") };
    const memberDues = (memberDuesData as NamedInvoice[] | null) ?? [];

    // An early-billed next month (or any later one) stays on this row at the
    // old price and blocks the new row's anchor for that month.
    const oldEnd = reopenEndOf(current.start_date, startDate);
    const later = memberDues.filter((d) => (monthStartOf(d.period) ?? d.period) > oldEnd);
    const laterPeriods = periodsAfter(later.map((d) => d.period), oldEnd);
    const accepted = acceptedPeriods(input.acceptedLaterPeriods);
    const unaccepted = laterPeriods.some((p) => !accepted.has(p));

    if (input.confirmClose !== true || unaccepted) {
      const lost = monthsLostOnReopen(current, startDate, lastBillingRunDay(), memberDues.map((d) => d.period));
      return {
        ok: false,
        needsConfirm: true,
        laterPeriods,
        error: [
          `Ky ndryshim përfundon anëtarësinë e tanishme dhe hap një të re nga ${formatDate(startDate)}, sepse ` +
            `${reopenReason(current.start_date, hasInvoices, startDate)}.`,
          lostMonthsSentence(lost),
          laterInvoicesOnReopen(later),
          "Konfirmo nëse do të vazhdosh.",
        ].filter(Boolean).join(" "),
      };
    }
  }

  const { data, error } = await admin.rpc("set_member_plan", {
    p_member_id: memberId,
    p_plan_id: plan.id,
    p_amount: amount,
    p_billable: billable,
    p_start: startDate,
    // Case 4 only when THIS read predicted it and the admin confirmed it; a
    // correction that a concurrent write turned into a close is refused in SQL.
    p_allow_close: planCase === "reopen" && input.confirmClose === true,
  });
  if (error) return { ok: false, error: dbError(error, "Ruajtja e anëtarësisë dështoi. Provo sërish.") };
  if (data === null) {
    return {
      ok: false,
      needsConfirm: true,
      error:
        "Ndërkohë dikush ndryshoi këtë anëtarësi ose lëshoi një faturë për të, dhe tani ky ndryshim do ta " +
        `përfundonte periudhën e tanishme dhe do të hapte një të re nga ${formatDate(startDate)}. Asgjë nuk u ruajt. ` +
        "Konfirmo nëse do të vazhdosh, ose mbylle dhe rifresko faqen për ta parë gjendjen e re.",
    };
  }
  if (typeof data !== "string") return { ok: false, error: "Anëtarësia nuk u ruajt. Provo sërish." };

  refreshMoney();
  return { ok: true, membershipId: data, billable, amountEur: amount, startDate };
}

/**
 * END a membership: this is how somebody LEAVES the academy.
 *
 * status 'ended' + an end date, and nothing else. It deletes nothing and
 * restates nothing: plan_id, amount_eur and billable are left exactly as they
 * are, because invoices already issued point at this row for their terms. What
 * stops is the FUTURE, and it stops AT ONCE — generate_dues_anchored_for_date
 * only ever looks at status = 'active'. That is why the end date may not lie in
 * the future (latestEndDate in ./membership.ts): a future date would promise
 * invoices the job will never cut. Months up to the end date can still be
 * generated by hand — generate_dues_for_members covers an 'ended' row through
 * its end date.
 *
 * Invoices for months AFTER the end (an early-billed next month is the normal
 * case) are not touched, but they are named and must be confirmed: each keeps
 * the member's unique(member_id, period) slot and an unpaid one reads as debt.
 *
 * A membership that has NOT STARTED and carries no invoice is removed instead.
 * An 'ended' row still covers its start month for manual and early generation,
 * which would preselect a rider who never began; with nothing pointing at the
 * row there is no history to keep (set_member_plan's case 3 reasoning).
 *
 * This is the one membership write that does not go through set_member_plan():
 * that function opens a period, it has no way to close one without opening
 * another. The write touches the WINDOW only (status, end_date) — the same two
 * columns set_member_plan() itself moves when it closes a row — and runs on the
 * caller's own session, so memberships_write_staff (admin|staff) is enforced by
 * RLS on top of the gate above.
 */
export async function endPersonMembership(input: {
  membershipId: string;
  /** "YYYY-MM-DD". The last day the membership covers. */
  endDate: string;
  /** Invoiced months after the end the admin was shown. */
  acceptedLaterPeriods?: string[];
}): Promise<
  | { ok: true; /** Null when the not-yet-started row was removed. */ endDate: string | null }
  | { ok: false; error: string; needsConfirm?: boolean; laterPeriods?: string[] }
> {
  const gate = await requireMoneyStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const membershipId = (input.membershipId ?? "").trim();
  if (!membershipId) return { ok: false, error: "Anëtarësia nuk u gjet. Rifresko faqen." };

  const supabase = await createClient();

  const { data: rowData, error: readErr } = await supabase
    .from("memberships")
    .select("id, member_id, start_date, end_date, status")
    .eq("id", membershipId)
    .maybeSingle();
  if (readErr) return { ok: false, error: dbError(readErr, "Leximi i anëtarësisë dështoi. Provo sërish.") };
  const row = rowData as { id: string; member_id: string; start_date: string; end_date: string | null; status: string } | null;
  if (!row) return { ok: false, error: "Anëtarësia nuk u gjet. Rifresko faqen." };
  if (row.status !== "active") {
    return { ok: false, error: "Kjo anëtarësi nuk është aktive — dikush e mbylli ndërkohë. Rifresko faqen." };
  }

  const today = clubTodayISO();
  const { data: duesData, error: duesErr } = await supabase
    .from("dues")
    .select("membership_id, period, invoice_no, amount_eur, status")
    .eq("member_id", row.member_id)
    .order("period");
  if (duesErr) return { ok: false, error: dbError(duesErr, "Leximi i faturave dështoi. Provo sërish.") };
  const dues = (duesData as (NamedInvoice & { membership_id: string | null })[] | null) ?? [];

  // Not started, nothing invoiced: cancelled outright, covering no month.
  if (row.start_date > today && !dues.some((d) => d.membership_id === row.id)) {
    const { data: removed, error: delErr } = await supabase
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (delErr) return { ok: false, error: dbError(delErr, "Heqja e anëtarësisë dështoi. Provo sërish.") };
    if (!removed) return { ok: false, error: "Anëtarësia nuk u hoq — provo sërish pas rifreskimit." };
    refreshMoney();
    return { ok: true, endDate: null };
  }

  const endDate = (input.endDate ?? "").trim();
  // memberships carries check (end_date is null or end_date >= start_date); the
  // check runs here first so the refusal names the start date. The upper bound
  // is the CLUB's today, never the server's UTC day.
  const endErr = endDateError(endDate, row.start_date, today);
  if (endErr) return { ok: false, error: endErr };

  const cutoff = endCutoff(row.start_date, endDate, today);
  const later = dues.filter((d) => (monthStartOf(d.period) ?? d.period) > cutoff);
  const laterPeriods = periodsAfter(later.map((d) => d.period), cutoff);
  const accepted = acceptedPeriods(input.acceptedLaterPeriods);
  if (laterPeriods.some((p) => !accepted.has(p))) {
    return {
      ok: false,
      needsConfirm: true,
      laterPeriods,
      error: `${laterInvoicesOnEnd(later)} Konfirmo nëse do ta përfundosh gjithsesi.`,
    };
  }

  // .eq("status", "active") makes a double press harmless: the second one
  // matches no row and is reported as "somebody closed it" above, never as a
  // second close writing a different end date over the first.
  const { data: updated, error } = await supabase
    .from("memberships")
    .update({ status: "ended", end_date: endDate })
    .eq("id", membershipId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: dbError(error, "Mbyllja e anëtarësisë dështoi. Provo sërish.") };
  if (!updated) return { ok: false, error: "Anëtarësia nuk u mbyll — provo sërish pas rifreskimit." };

  refreshMoney();
  return { ok: true, endDate };
}
