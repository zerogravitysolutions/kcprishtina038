"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { dbError } from "@/lib/errors";
import type { TableUpdate } from "@/lib/supabase/types";
import { slugifyName, splitName, uniqueSlug } from "@/lib/slug";
// The billing-anchor helpers. They live under /admin/people because that is the
// other screen that writes a membership start date; they are a plain module (no
// "use client", no server-only import), so the form, this action and the panel
// all validate with the identical rules.
import { monthStartOf, planChangeCase, startDateError } from "@/app/admin/people/membership";
import { clubTodayISO } from "@/lib/clubtime";
import { formatDate } from "@/lib/finance";

// Enrolment = turning an approved application into a real cyclist:
// an auth user + profile, a membership (which IS the payment schedule) and,
// optionally, the first invoice. It all happens in ONE server action so the
// admin cannot end up with half a member.
//
// ORDER MATTERS. approve_application() refuses to run twice — it raises when
// the application is no longer 'pending'. So the RPC is called LAST, after the
// account, the membership and the invoice already exist. If something blows up
// mid-way the application stays 'pending' and the admin can simply click again:
// every step below is written to be re-runnable (the account is looked up by
// email, the membership goes through set_member_plan() — which does nothing at
// all when the active row already matches — and the invoice is keyed on
// member + period). Approving first would do the opposite — a failure after
// the RPC would strand an approved application with no member behind it and no
// way back through the UI.

/**
 * approve_application() `raise exception`s with its own English text. By the
 * time it runs, the account, the profile and the membership already exist, so
 * each message has to say in ONE breath what failed AND what was kept —
 * gluing a generic sentence onto "Rifresko faqen." produced two contradictory
 * instructions when two admins approved the same application at once.
 */
function approveError(error: { message: string }): string {
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("not authorised")) {
    return "Nuk ke leje ta miratosh këtë aplikim. Anëtari dhe anëtarësia u ruajtën, por aplikimi mbeti në pritje.";
  }
  if (m.includes("application already")) {
    return "Këtë aplikim e shqyrtoi dikush tjetër ndërkohë. Anëtari dhe anëtarësia u ruajtën — rifresko faqen për ta parë gjendjen e re.";
  }
  if (m.includes("application not found")) {
    return "Aplikimi nuk u gjet — ka gjasa të jetë fshirë ndërkohë. Anëtari dhe anëtarësia u ruajtën.";
  }
  return `${dbError(error, "Miratimi i aplikimit dështoi.")} Anëtari dhe anëtarësia u ruajtën — provo sërish.`;
}

/** Confirm the caller is a signed-in, ACTIVE admin or staff — the same bar
 * approve_application() enforces in SQL. Checked here too, BEFORE any account
 * is created, so an unauthorised click never leaves anything behind. */
async function requireStaff(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const p = data as { role: string; status: string } | null;
  if (!p || p.status !== "active") return { ok: false, error: "Llogaria jote nuk është aktive." };
  if (!["admin", "staff"].includes(p.role)) return { ok: false, error: "Vetëm admini ose stafi mund ta bëjë këtë veprim." };
  return { ok: true, id: user.id };
}

// ---------- small helpers ----------

// No l/1/0/o — the admin reads this password out loud over the phone.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(len = 12): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

// normalisePeriod() used to live here and was applied to the ENROLMENT START
// DATE: "2026-09-18" came in and "2026-09-01" went to set_member_plan. Every
// membership in the club therefore started on the 1st, and since the club bills
// on the membership's start DAY (generate_dues_anchored_for_date, migration
// 20260818000001), no rider could ever be billed on the day they actually
// joined. One member was misfiled by six weeks by exactly that.
//
// It is replaced by monthStartOf() from the membership helpers, which does the
// same thing but is now applied to ONE value only: dues.period, the
// first-of-month bucket that unique(member_id, period) uses to stop a member
// being invoiced twice for one month. The start date itself travels intact.
// The only caller of normalisePeriod() was the line below (checked repo-wide:
// nothing else imported it — it was file-local and never exported).
//
// "Today" is clubTodayISO() — the club's calendar day. The server runs in UTC,
// so for the first hours after midnight in Kosovo its own date is yesterday.

type AdminClient = ReturnType<typeof createAdminClient>;

/** Last resort when createUser says the email is taken but profiles has no row
 * for it (an auth user whose profile was deleted). listUsers has no email
 * filter, so we page through it. */
async function findAuthUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// ---------- the roster row: making an enrolled rider visible to the coach ----

// Enrolment used to create the account, the profile, the membership and the
// first invoice — and NOT a team_members row. The club's two identity tables
// serve different systems:
//
//   profiles(id)      → money   (dues.member_id, memberships.member_id)
//   team_members(id)  → training + the public roster
//                       (ride_entries.athlete_id, athlete_profiles.athlete_id)
//
// so an enrolled academy rider was billable and, at the same time, invisible to
// their coach: the athlete picker reads team_members, and they had no row
// there. This creates that row and links it via team_members.profile_id.
//
// STATUS — a deliberate choice, not a default. public.team_status has exactly
// two values, 'active' and 'past', and app/team/page.tsx renders BOTH: 'active'
// under Bordi/Trajnerët/Çiklistët, 'past' under "Anëtarët e mëparshëm". There
// is no unlisted state, so 'past' would publish the new rider anyway AND
// misfile them as a former member. 'active' is therefore the only defensible
// value: it is truthful, and it is the only one the training athlete picker
// accepts (it filters status='active' + positions contains 'rider'), which is
// the whole point of creating the row. Only the name (and, through the card,
// the derived age category) becomes public — no photo and no bio are written
// here. If the club wants review-before-publish, that needs a third enum value
// and a migration; see the notes for this change.
//
// It must never cost the club an enrolment: every failure below is swallowed
// into a warning. The member and their invoices matter more than the roster.

type RosterInput = {
  memberId: string;
  fullName: string;
  dob: string | null;
  sectionId: string | null;
};

async function ensureRosterRow(admin: AdminClient, input: RosterInput): Promise<string | null> {
  const { first, last, full } = splitName(input.fullName);
  // full_name / first_name / last_name are all NOT NULL.
  if (!first || !last || !full) return "Anëtari u regjistrua, por nuk u shtua në ekip sepse emri nuk ndahet në emër dhe mbiemër. Shtoje me dorë te Njerëzit.";

  // Idempotent: a second click, or a member who is already on the roster.
  const { data: linked, error: linkedErr } = await admin
    .from("team_members").select("id").eq("profile_id", input.memberId).limit(1);
  if (linkedErr) return "Anëtari u regjistrua, por nuk u verifikua dot nëse është në ekip. Kontrollo te Njerëzit.";
  if ((linked ?? []).length > 0) return null;

  // Already on the roster by name but never linked (added by hand before they
  // applied). Link that row instead of creating a second one for one human.
  const { data: sameName } = await admin
    .from("team_members").select("id").is("profile_id", null).ilike("full_name", full).limit(2);
  const candidates = (sameName as { id: string }[] | null) ?? [];
  if (candidates.length === 1) {
    const { error } = await admin.from("team_members").update({ profile_id: input.memberId }).eq("id", candidates[0].id);
    return error
      ? "Anëtari u regjistrua, por lidhja me rreshtin ekzistues në ekip dështoi. Lidhe te Njerëzit."
      : null;
  }

  // section_slug is text on the roster, a uuid on the application.
  let sectionSlug: string | null = null;
  if (input.sectionId) {
    const { data: sec } = await admin.from("sections").select("slug").eq("id", input.sectionId).maybeSingle();
    sectionSlug = (sec as { slug: string } | null)?.slug ?? null;
  }

  // slug is NOT NULL, unique, and check (slug ~ '^[a-z][a-z0-9-]*$') — the
  // helper transliterates ë→e / ç→c and guarantees a leading letter.
  const base = slugifyName(full);
  const slug = await uniqueSlug(base, async (candidate) => {
    const { data } = await admin.from("team_members").select("id").eq("slug", candidate).maybeSingle();
    return !!data;
  });

  const { error } = await admin.from("team_members").insert([{
    slug,
    full_name: full,
    first_name: first,
    last_name: last,
    dob: input.dob,
    // positions is NOT NULL with check (array_length(positions, 1) >= 1); an
    // enrolled applicant is a rider, which is also what makes them selectable
    // in training.
    positions: ["rider"],
    section_slug: sectionSlug,
    status: "active",
    profile_id: input.memberId,
    display_order: 100,
  }]);
  return error
    ? "Anëtari u regjistrua, por nuk u shtua në listën e ekipit, prandaj trajneri s’e sheh ende në stërvitje. Shtoje te Njerëzit."
    : null;
}

// ---------- types ----------

export type EnrolInput = {
  appId: string;
  planId: string;
  /** Monthly amount in euro. IGNORED when the plan is not billable. */
  amountEur: number;
  /**
   * The membership start DATE, "YYYY-MM-DD" — a real day, not a month.
   *
   * It reaches set_member_plan(p_start) untouched, because its DAY is the
   * club's billing anchor: a rider who joins on the 18th is billed on the 18th
   * of every month afterwards. Only the first invoice's `period` is flattened
   * to the first of the month, and only because that column is the
   * unique(member_id, period) bucket.
   */
  startDate: string;
  generateFirstInvoice: boolean;
};

export type EnrolResult =
  | {
      ok: true;
      /** Set only when a brand-new login was created — the admin hands it over. */
      password: string | null;
      /** True when the email already had an account and we linked to it. */
      linked: boolean;
      billable: boolean;
      amountEur: number;
      startDate: string;
      invoiceNo: string | null;
      /** Enrolment succeeded, but something still needs a human. Albanian. */
      warning: string | null;
    }
  | { ok: false; error: string };

type AppRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  section_id: string | null;
  plan_id: string | null;
  status: string;
  created_at: string;
};

type ActiveMembershipRow = {
  id: string;
  plan_id: string;
  amount_eur: number | string;
  billable: boolean;
  start_date: string;
  created_at: string;
};

type PlanRow = { id: string; name_sq: string; amount_eur: number | string | null; billable: boolean };

type ProfileRow = {
  id: string;
  role: string;
  status: string;
  joined_at: string | null;
  section_id: string | null;
  phone: string | null;
  dob: string | null;
};

const PROFILE_COLS = "id, role, status, joined_at, section_id, phone, dob";

// ---------- the enrolment action ----------

/**
 * Approve an application AND enrol the applicant in one go.
 *
 * The admin's overrides win over the applicant's choices: a different tier, a
 * waived amount (the club gives free membership to riders under 14 on a paying
 * tier) and the start month are all decided here, not on /join.
 *
 * A non-billable tier (the competition racers) is never asked for an amount and
 * never invoiced: amount is forced to 0, billable to false and the
 * first-invoice flag is ignored. Salaries for those riders do not exist yet and
 * are deliberately not modelled.
 */
export async function enrolApplication(input: EnrolInput): Promise<EnrolResult> {
  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  let admin: AdminClient;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }

  // --- 1. the application must exist and still be pending -------------------
  const { data: appData, error: appErr } = await admin
    .from("applications")
    .select("id, full_name, email, phone, dob, section_id, plan_id, status, created_at")
    .eq("id", input.appId)
    .maybeSingle();
  if (appErr) return { ok: false, error: dbError(appErr, "Leximi i aplikimit dështoi. Provo sërish.") };
  const app = appData as AppRow | null;
  if (!app) return { ok: false, error: "Aplikimi nuk u gjet." };
  if (app.status !== "pending") return { ok: false, error: "Ky aplikim është shqyrtuar tashmë. Rifresko faqen." };

  // --- 2. the plan decides whether money is even part of this ---------------
  const { data: planData, error: planErr } = await admin
    .from("membership_plans")
    .select("id, name_sq, amount_eur, billable")
    .eq("id", input.planId)
    .maybeSingle();
  if (planErr) return { ok: false, error: dbError(planErr, "Leximi i planit dështoi. Provo sërish.") };
  const plan = planData as PlanRow | null;
  if (!plan) return { ok: false, error: "Plani i zgjedhur nuk u gjet. Rifresko faqen." };

  const billable = plan.billable === true;
  // A non-billable tier is not "€0 for now" — it is outside billing. We do not
  // read the amount the form sent, so a stale field can never bill a racer.
  let amount = 0;
  if (billable) {
    amount = Math.round(Number(input.amountEur) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Shuma mujore nuk është e vlefshme." };
    if (amount > 100000) return { ok: false, error: "Shuma mujore është shumë e madhe." };
  }

  // The start date survives EXACTLY as typed — it is the billing anchor. It is
  // validated as a real calendar date within a sane window (startDateError also
  // runs in the form, but React masks a Server Action throw in production, so
  // the server copy is the guard and the client copy is only the message).
  const startDate = (input.startDate ?? "").trim();
  const startErr = startDateError(startDate, clubTodayISO());
  if (startErr) return { ok: false, error: startErr };

  // The invoice bucket, and the ONLY place the date is flattened to a month.
  const invoicePeriod = monthStartOf(startDate);
  if (!invoicePeriod) return { ok: false, error: "Data e fillimit nuk është e vlefshme." };

  const wantsInvoice = input.generateFirstInvoice && billable && amount > 0;

  // --- 3. the account: link an existing one, otherwise create it ------------
  const email = (app.email ?? "").trim().toLowerCase();
  const fullName = (app.full_name ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i i aplikuesit nuk është i vlefshëm." };

  const { data: existingData } = await admin
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("email", email)
    .maybeSingle();
  let existing = existingData as ProfileRow | null;

  let memberId: string;
  let linked = false;
  let password: string | null = null;
  let warning: string | null = null;

  if (existing) {
    memberId = existing.id;
    linked = true;
  } else {
    password = generatePassword();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (cErr || !created?.user) {
      const msg = cErr?.message ?? "";
      if (/already been registered|already registered|exists/i.test(msg)) {
        // The login exists but has no profile row (or the profile carries a
        // different email). Link it instead of failing the whole enrolment.
        const foundId = await findAuthUserIdByEmail(admin, email);
        if (!foundId) return { ok: false, error: "Ky email ka tashmë një llogari që nuk u gjet dot. Kontakto administratorin." };
        memberId = foundId;
        linked = true;
        password = null;
      } else {
        return { ok: false, error: dbError(cErr, "Krijimi i llogarisë dështoi.") };
      }
    } else {
      memberId = created.user.id;
    }
  }

  // Re-read after linking an account whose profile we had not seen yet.
  if (linked && !existing) {
    const { data } = await admin.from("profiles").select(PROFILE_COLS).eq("id", memberId).maybeSingle();
    existing = data as ProfileRow | null;
  }

  // --- 4. the profile -------------------------------------------------------
  if (existing) {
    // Linking an account somebody already uses: activate it and fill the gaps,
    // but never rename them and never demote a coach/staff to 'member'.
    const patch: TableUpdate<"profiles"> = {};
    // 'suspended' is a deliberate sanction — approving an application must not
    // quietly undo it, so it is reported instead of overwritten.
    const reactivate = existing.status !== "active" && existing.status !== "suspended";
    if (reactivate) patch.status = "active";
    if (!existing.joined_at) patch.joined_at = clubTodayISO();
    if (!existing.section_id && app.section_id) patch.section_id = app.section_id;
    if (!existing.phone && app.phone) patch.phone = app.phone;
    if (!existing.dob && app.dob) patch.dob = app.dob;
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("profiles").update(patch).eq("id", memberId);
      if (error) return { ok: false, error: dbError(error, "Përditësimi i profilit dështoi.") };
    }
    if (existing.status === "suspended") {
      warning = "Llogaria e këtij email-i është e pezulluar, prandaj anëtari nuk mund të kyçet. Aktivizoje te Anëtarët.";
    } else if (reactivate) {
      // setMemberStatus() bans the login for every non-active status, so
      // flipping the profile back to 'active' without lifting the ban would
      // leave an "active" member who still cannot sign in.
      const { error } = await admin.auth.admin.updateUserById(memberId, { ban_duration: "none" });
      if (error) warning = "Profili u aktivizua, por qasja në llogari nuk u rikthye. Kontrollo te Anëtarët.";
    }
  } else {
    // handle_new_user already inserted a profile (member / pending) — promote
    // it. upsert covers the case where that trigger is missing.
    const { error } = await admin.from("profiles").upsert({
      id: memberId,
      full_name: fullName,
      email,
      role: "member",
      status: "active",
      joined_at: clubTodayISO(),
      ...(app.phone ? { phone: app.phone } : {}),
      ...(app.dob ? { dob: app.dob } : {}),
      ...(app.section_id ? { section_id: app.section_id } : {}),
    }, { onConflict: "id" });
    if (error) return { ok: false, error: dbError(error, "Llogaria u krijua, por profili s’u përditësua.") };
  }

  // --- 5. the membership = the payment schedule -----------------------------
  // A membership row is a PERIOD SPENT ON ONE PLAN, and it is immutable once an
  // invoice points at it: amount_eur and billable are frozen copies of the plan
  // (so a later price edit never restates it) and plan_id must not move either,
  // or a June invoice issued on Akademia II would read as a €0 Garues invoice
  // after a September promotion.
  //
  // set_member_plan() therefore owns the whole decision, in ONE transaction:
  //   • no active membership            → insert one;
  //   • the active row already matches   → nothing happens, so a double click
  //                                        or a retry churns no rows;
  //   • it differs, has no invoice and   → updated in place, because fixing a
  //     covers no earlier month            mistyped amount is a correction and
  //                                        must not leave a one-day stub;
  //   • anything else                    → closed ('ended', ending the day
  //                                        before the new start) and a new one
  //                                        opened, in that order so only ever
  //                                        one active row exists.
  // See migration 20260808000002, section E.
  //
  // A RETRY MUST NOT MOVE THE BILLING DAY. "Re-runnable" above holds only if a
  // retry sends the SAME start date: the first attempt may have opened the
  // membership (and cut its first invoice) and then failed at approval, and a
  // retry on a later day used to default to that later day — set_member_plan
  // then closed the first row and opened another, moving the member's billing
  // day and orphaning the first invoice on a stub. So before the RPC:
  //   • an active row opened AFTER this application was submitted, while it is
  //     still pending, came from an earlier attempt of this enrolment (or from
  //     Njerëzit in the meantime). Its start date is already the member's
  //     billing day, so a different one is refused, never applied;
  //   • any change that set_member_plan would turn into close-and-open (case 4)
  //     is refused as well. Enrolment has no confirmation step, and closing a
  //     period is an accounting event — it belongs on Njerëzit › Anëtarësia,
  //     which asks first. An identical request (case 2) and an in-place
  //     correction of an uninvoiced row (case 3) go through.
  // The form pre-fills the existing row's plan, amount and start date, so a
  // plain retry is identical and simply continues.
  const { data: activeData, error: activeErr } = await admin
    .from("memberships")
    .select("id, plan_id, amount_eur, billable, start_date, created_at")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeErr) return { ok: false, error: dbError(activeErr, "Leximi i anëtarësisë ekzistuese dështoi. Provo sërish.") };
  const active = activeData as ActiveMembershipRow | null;
  if (active) {
    const openedWhilePending = Date.parse(active.created_at) >= Date.parse(app.created_at);
    if (openedWhilePending && active.start_date !== startDate) {
      return {
        ok: false,
        error:
          `Anëtarësia e këtij personi është hapur tashmë nga ${formatDate(active.start_date)}, nga një përpjekje e ` +
          "mëparshme e këtij regjistrimi. Ajo datë është dita e faturimit dhe një përsëritje nuk e ndryshon. " +
          `Vendos datën e fillimit ${formatDate(active.start_date)} dhe provo sërish; nëse data duhet ndryshuar ` +
          "vërtet, ndryshoje te Njerëzit › Anëtarësia pasi të aprovohet aplikimi.",
      };
    }
    const { data: activeDues, error: activeDuesErr } = await admin
      .from("dues").select("id").eq("membership_id", active.id).limit(1);
    if (activeDuesErr) return { ok: false, error: dbError(activeDuesErr, "Leximi i faturave dështoi. Provo sërish.") };
    const activeHasDues = ((activeDues as { id: string }[] | null) ?? []).length > 0;
    if (planChangeCase(active, activeHasDues, { planId: plan.id, amount, billable, startDate }) === "reopen") {
      return {
        ok: false,
        error:
          `Ky person ka tashmë një anëtarësi aktive nga ${formatDate(active.start_date)}` +
          (activeHasDues ? ", me fatura të lëshuara" : "") +
          ". Regjistrimi nuk e përfundon atë. Lëri planin, shumën dhe datën e fillimit siç janë për ta aprovuar " +
          "aplikimin, pastaj ndryshoje te Njerëzit › Anëtarësia, ku ndryshimi konfirmohet.",
      };
    }
  }

  const { data: membershipData, error: membershipErr } = await admin.rpc("set_member_plan", {
    p_member_id: memberId,
    p_plan_id: plan.id,
    p_amount: amount,
    p_billable: billable,
    p_start: startDate,
    // Never a close-and-open from here. The refusal above runs on a read taken
    // before this call; this one is decided under set_member_plan's lock.
    p_allow_close: false,
  });
  if (membershipErr) return { ok: false, error: dbError(membershipErr, "Ruajtja e anëtarësisë dështoi.") };
  if (membershipData === null) {
    return {
      ok: false,
      error:
        "Ndërkohë anëtarësia e këtij personi u ndryshua, dhe regjistrimi tani do ta përfundonte periudhën e " +
        "tanishme. Asgjë nuk u ruajt. Rifresko faqen dhe provo sërish; nëse periudha duhet përfunduar, " +
        "ndryshoje te Njerëzit › Anëtarësia.",
    };
  }
  if (typeof membershipData !== "string") {
    return { ok: false, error: "Anëtarësia nuk u ruajt. Provo sërish." };
  }
  const membershipId: string = membershipData;

  // --- 6. the first invoice (optional, billable tiers only) -----------------
  let invoiceNo: string | null = null;
  if (wantsInvoice) {
    const r = await createInvoice(admin, {
      memberId,
      membershipId,
      // First of the billed month: the idempotency bucket, so the anchored cron
      // and a manual month backfill both recognise this invoice as "already
      // issued" and cannot bill the member a second time for it.
      period: invoicePeriod,
      // The INVOICE DATE is the day the membership starts, which is also the
      // day every later invoice for this member will carry. The trigger then
      // derives due_date = issued_on + 5, the same rule as every other
      // generation path (migration 20260818000001, section B).
      issuedOn: startDate,
      amount,
    });
    if (!r.ok) return { ok: false, error: r.error };
    invoiceNo = r.invoiceNo;
  }

  // --- 7. approve LAST, with the caller's own session so auth.uid() is the
  // reviewer and approve_application writes a truthful audit row. -------------
  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc("approve_application", { app_id: input.appId });
  if (rpcErr) return { ok: false, error: approveError(rpcErr) };

  // --- 8. the roster row = the athlete identity -----------------------------
  // Without it the new member is billable but invisible to their coach: the
  // training athlete picker reads team_members, not profiles.
  //
  // It runs LAST, on purpose. The row is PUBLIC the moment it exists (see
  // ensureRosterRow), so it must not be written while the enrolment can still
  // fail: a membership, invoice or approval error above would otherwise leave a
  // child's name on kcprishtina038.cc for an enrolment that never happened.
  // It stays best-effort — a failure here degrades to a warning, because the
  // member and their invoices matter more than the roster.
  try {
    const rosterWarning = await ensureRosterRow(admin, {
      memberId,
      fullName,
      dob: app.dob,
      sectionId: app.section_id,
    });
    if (rosterWarning) warning = warning ? `${warning} ${rosterWarning}` : rosterWarning;
  } catch {
    const msg = "Anëtari u regjistrua, por shtimi në listën e ekipit dështoi. Shtoje te Njerëzit që trajneri ta shohë në stërvitje.";
    warning = warning ? `${warning} ${msg}` : msg;
  }

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${input.appId}`);
  revalidatePath("/admin/people");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/finance");
  // The enrolment now also writes a public roster row.
  revalidatePath("/team");

  return { ok: true, password, linked, billable, amountEur: amount, startDate, invoiceNo, warning };
}

/**
 * One invoice row in `dues` for the member's first month.
 *
 * invoice_no and due_date are NOT computed here. The BEFORE INSERT trigger on
 * `dues` (migration 20260808000002 section F, updated by 20260818000001 section
 * B) assigns them, so the format, the per-period counter and the +5 due date
 * live in exactly one place and this path can no longer hand out a number the
 * SQL generator is about to use. We only read back what the database chose.
 *
 * We DO send issued_on — the invoice date, which is the membership's start day.
 * That is a business fact this path knows and the trigger cannot guess, and it
 * is what the trigger then adds 5 days to.
 */
async function createInvoice(
  admin: AdminClient,
  args: { memberId: string; membershipId: string; period: string; issuedOn: string; amount: number },
): Promise<{ ok: true; invoiceNo: string | null } | { ok: false; error: string }> {
  const { memberId, membershipId, period, issuedOn, amount } = args;

  const readExisting = async (): Promise<string | null | undefined> => {
    const { data } = await admin.from("dues")
      .select("invoice_no")
      .eq("member_id", memberId)
      .eq("period", period)
      .maybeSingle();
    return data ? (data as { invoice_no: string | null }).invoice_no : undefined;
  };

  // unique(member_id, period) — an invoice for this month may already exist
  // (the cron ran, or this is a retry). Nothing to do.
  const existing = await readExisting();
  if (existing !== undefined) return { ok: true, invoiceNo: existing };

  const { data, error } = await admin.from("dues")
    .insert({
      member_id: memberId,
      membership_id: membershipId,
      period,
      issued_on: issuedOn,
      amount_eur: amount,
      status: "unpaid",
    })
    .select("invoice_no")
    .single();

  if (error) {
    // Someone inserted this member's invoice for the period in between — that
    // is the outcome we wanted anyway, so report theirs instead of failing.
    if ((error as { code?: string }).code === "23505") {
      const raced = await readExisting();
      if (raced !== undefined) return { ok: true, invoiceNo: raced };
    }
    return { ok: false, error: dbError(error, "Anëtarësia u krijua, por fatura e parë nuk u gjenerua.") };
  }

  return { ok: true, invoiceNo: (data as { invoice_no: string | null }).invoice_no };
}
