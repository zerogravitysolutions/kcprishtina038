"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { dbError } from "@/lib/errors";

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

// Call RPC inline on the supabase client. Extracting `supabase.rpc` into a
// local const breaks `this` binding — supabase-js's rpc() implementation
// accesses `this.rest`, so the detached call throws.
type RpcAny = (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

/** Same, for an RPC whose return value we need. */
type RpcData = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

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

/** "2026-09" or "2026-09-14" → "2026-09-01". Null when unparseable. */
function normalisePeriod(value: string): string | null {
  const m = (value ?? "").match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

// ---------- types ----------

export type EnrolInput = {
  appId: string;
  planId: string;
  /** Monthly amount in euro. IGNORED when the plan is not billable. */
  amountEur: number;
  /** First billed month, "YYYY-MM" or "YYYY-MM-DD". */
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
    .select("id, full_name, email, phone, dob, section_id, plan_id, status")
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

  const startDate = normalisePeriod(input.startDate);
  if (!startDate) return { ok: false, error: "Muaji i fillimit nuk është i vlefshëm." };

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
    const patch: Record<string, unknown> = {};
    // 'suspended' is a deliberate sanction — approving an application must not
    // quietly undo it, so it is reported instead of overwritten.
    const reactivate = existing.status !== "active" && existing.status !== "suspended";
    if (reactivate) patch.status = "active";
    if (!existing.joined_at) patch.joined_at = todayISO();
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
      joined_at: todayISO(),
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
  const { data: membershipData, error: membershipErr } = await (admin.rpc as unknown as RpcData)
    .call(admin, "set_member_plan", {
      p_member_id: memberId,
      p_plan_id: plan.id,
      p_amount: amount,
      p_billable: billable,
      p_start: startDate,
    });
  if (membershipErr) return { ok: false, error: dbError(membershipErr, "Ruajtja e anëtarësisë dështoi.") };
  if (typeof membershipData !== "string") {
    return { ok: false, error: "Anëtarësia nuk u ruajt. Provo sërish." };
  }
  const membershipId: string = membershipData;

  // --- 6. the first invoice (optional, billable tiers only) -----------------
  let invoiceNo: string | null = null;
  if (wantsInvoice) {
    const r = await createInvoice(admin, { memberId, membershipId, period: startDate, amount });
    if (!r.ok) return { ok: false, error: r.error };
    invoiceNo = r.invoiceNo;
  }

  // --- 7. approve LAST, with the caller's own session so auth.uid() is the
  // reviewer and approve_application writes a truthful audit row. -------------
  const supabase = await createClient();
  const { error: rpcErr } = await (supabase.rpc as unknown as RpcAny).call(supabase, "approve_application", { app_id: input.appId });
  if (rpcErr) return { ok: false, error: approveError(rpcErr) };

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${input.appId}`);
  revalidatePath("/admin/members");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/finance");

  return { ok: true, password, linked, billable, amountEur: amount, startDate, invoiceNo, warning };
}

/**
 * One invoice row in `dues` for the member's first month.
 *
 * invoice_no and due_date are NOT computed here. The BEFORE INSERT trigger on
 * `dues` (migration 20260808000002, section F) assigns them, so the format and
 * the per-period counter live in exactly one place and this path can no longer
 * hand out a number the SQL generator is about to use. We only read back what
 * the database chose.
 */
async function createInvoice(
  admin: AdminClient,
  args: { memberId: string; membershipId: string; period: string; amount: number },
): Promise<{ ok: true; invoiceNo: string | null } | { ok: false; error: string }> {
  const { memberId, membershipId, period, amount } = args;

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
