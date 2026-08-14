"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { dbError } from "@/lib/errors";
import type { MemberStatus, UserRole } from "@/lib/supabase/types";
// Same gate /admin/people uses — one definition, so the merged screen cannot
// widen what "admin only" means here.
import { requireAdmin } from "./guards";

// Typed against the column unions so a role/status removed from the enum is a
// compile error here rather than a runtime 22P02 from Postgres.
const MEMBER_ROLES: readonly UserRole[] = ["admin", "editor", "staff", "coach", "member"];
const MEMBER_STATUSES: readonly MemberStatus[] = ["active", "inactive", "suspended", "pending"];

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// These RPCs `raise exception` with their own English text, which no SQLSTATE
// mapping can recover. Translate the cases an admin can actually hit, then hand
// anything else to the shared mapper.
function rpcError(error: { message: string }, fallback: string): string {
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("not authorised")) return "Nuk ke leje për këtë veprim.";
  if (m.includes("application already")) return "Ky aplikim është shqyrtuar tashmë. Rifresko faqen.";
  if (m.includes("application not found")) return "Aplikimi nuk u gjet.";
  if (m.includes("demote themselves")) return "Nuk mund ta ndryshosh rolin tënd.";
  if (m.includes("target profile not found")) return "Përdoruesi nuk u gjet.";
  return dbError(error, fallback);
}

export async function approveApplication(appId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_application", { app_id: appId });
  if (error) return { ok: false, error: rpcError(error, "Miratimi i aplikimit dështoi. Provo sërish.") };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function rejectApplication(appId: string, reason: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_application", { app_id: appId, reason: reason ?? null });
  if (error) return { ok: false, error: rpcError(error, "Refuzimi i aplikimit dështoi. Provo sërish.") };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function setUserRole(targetId: string, newRole: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  // newRole arrives from a client <select>, so it is untrusted here — but
  // set_user_role's own parameter is public.user_role, so Postgres rejects
  // anything outside the enum before the function body runs. The cast only
  // states that; it does not widen what the DB accepts.
  const { error } = await supabase.rpc("set_user_role", { target_id: targetId, new_role: newRole as UserRole });
  if (error) return { ok: false, error: rpcError(error, "Ndryshimi i rolit dështoi. Provo sërish.") };
  revalidatePath("/admin/people");
  revalidatePath("/admin/staff");
  return { ok: true };
}

// ---------- Member (account) management — admin only ----------

/** Create an auth user + promote their auto-created profile. */
export async function createMember(input: { full_name: string; email: string; password: string; role: string }): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const full_name = (input.full_name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  // find() rather than includes() so `role` narrows to UserRole.
  const role = MEMBER_ROLES.find((r) => r === input.role) ?? "member";
  if (full_name.length < 2) return { ok: false, error: "Shkruaj emrin e plotë." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };
  if (password.length < 8) return { ok: false, error: "Fjalëkalimi duhet të ketë së paku 8 karaktere." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (cErr || !created?.user) {
    const msg = cErr?.message ?? "";
    if (/already been registered|exists/i.test(msg)) return { ok: false, error: "Ky email është regjistruar tashmë." };
    return { ok: false, error: dbError(cErr, "Krijimi i llogarisë dështoi.") };
  }

  // handle_new_user trigger already inserted a profile (member / pending) — promote it.
  const { error: uErr } = await admin.from("profiles")
    .update({ full_name, role, status: "active", joined_at: new Date().toISOString().slice(0, 10) })
    .eq("id", created.user.id);
  if (uErr) return { ok: false, error: dbError(uErr, "Llogaria u krijua, por profili s’u përditësua.") };

  revalidatePath("/admin/people");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

/** Activate / deactivate (or suspend) a member — flips profiles.status. */
export async function setMemberStatus(targetId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (targetId === gate.id) return { ok: false, error: "Nuk mund të çaktivizosh llogarinë tënde." };
  // find() rather than includes() so the value narrows to MemberStatus.
  const memberStatus = MEMBER_STATUSES.find((s) => s === status);
  if (!memberStatus) return { ok: false, error: "Statusi nuk është i vlefshëm." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { error } = await admin.from("profiles").update({ status: memberStatus }).eq("id", targetId);
  if (error) return { ok: false, error: dbError(error, "Ndryshimi i statusit dështoi. Provo sërish.") };
  // Revoke (or restore) the auth session so a deactivated user is cut off
  // immediately everywhere — not just when a page/layout re-checks status.
  // Anything other than "active" bans the login; "active" lifts the ban.
  const { error: banErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: status === "active" ? "none" : "876000h" });
  if (banErr) return { ok: false, error: dbError(banErr, "Statusi u ndryshua, por sesioni s’u përditësua.") };
  revalidatePath("/admin/people");
  return { ok: true };
}

// ---------- Deleting an account vs. keeping the books ----------
//
// Deleting the auth user deletes the profile (auth.users -> profiles is ON
// DELETE CASCADE), and the profile used to take `dues` and `memberships` with
// it — i.e. removing a login silently erased the club's invoices, paid ones
// included. Migration 20260810000001 changed both of those FKs to ON DELETE
// RESTRICT, so the DATABASE now refuses; nothing here has to be remembered for
// the accounting record to survive.
//
// What is left for this layer is the explanation. A RESTRICT violation reaches
// us through GoTrue as an opaque 500 ("Database error deleting user"), so we
// count the history FIRST and tell the admin, in Albanian, exactly what exists
// and what to do instead. The post-delete branch below is the backstop for
// anything the pre-check could not see.

type FinancialHistory = { dues: number; memberships: number };

/** How much accounting history hangs off this member. `null` = we could not
 * find out, which is NOT the same as "nothing is there" — see the caller: an
 * unverifiable delete is refused rather than attempted. */
async function financialHistory(
  admin: ReturnType<typeof createAdminClient>,
  targetId: string,
): Promise<FinancialHistory | null> {
  const [d, m] = await Promise.all([
    admin.from("dues").select("id", { count: "exact", head: true }).eq("member_id", targetId),
    admin.from("memberships").select("id", { count: "exact", head: true }).eq("member_id", targetId),
  ]);
  if (d.error || m.error) return null;
  return { dues: d.count ?? 0, memberships: m.count ?? 0 };
}

/** Point the admin at deactivation, which already revokes access completely. */
const USE_DEACTIVATE =
  "Përdor “Çaktivizo llogarinë”: hyrja i bllokohet menjëherë, ndërsa historiku financiar i mbetet klubit.";

function historyRefusal(h: FinancialHistory): string {
  const parts: string[] = [];
  if (h.dues) parts.push(h.dues === 1 ? "1 faturë" : `${h.dues} fatura`);
  if (h.memberships) parts.push(h.memberships === 1 ? "1 anëtarësi" : `${h.memberships} anëtarësi`);
  // Name what actually exists — a member can have a membership without ever
  // having been invoiced (a racer, or someone enrolled mid-month).
  const what = h.dues ? "Faturat" : "Anëtarësitë";
  return `Ky anëtar ka ${parts.join(" dhe ")} në histori. ${what} janë regjistri kontabël i klubit dhe nuk fshihen bashkë me llogarinë. ${USE_DEACTIVATE}`;
}

/** Permanently delete a member's auth user — only when nothing is booked
 * against them. Members WITH financial history are refused here and, if this
 * check is ever bypassed, by the foreign keys themselves. */
export async function deleteMember(targetId: string): Promise<{ ok: boolean; error?: string; blocked?: boolean }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (targetId === gate.id) return { ok: false, error: "Nuk mund të fshish llogarinë tënde." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }

  const history = await financialHistory(admin, targetId);
  // Could not read the history at all. Deleting anyway would rest the club's
  // books on migration 20260810000001 already being applied to THIS database —
  // and on a database where it is not, the old ON DELETE CASCADE would take the
  // invoices without a word. An irreversible action does not get to assume; it
  // asks again.
  if (!history) {
    return {
      ok: false,
      blocked: true,
      error: `Nuk u verifikua dot nëse ky anëtar ka fatura ose anëtarësi, prandaj fshirja nuk u krye. Provo sërish pas pak. ${USE_DEACTIVATE}`,
    };
  }
  if (history.dues > 0 || history.memberships > 0) {
    return { ok: false, blocked: true, error: historyRefusal(history) };
  }

  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) {
    // The Auth Admin API wraps a Postgres constraint failure in its own 500, so
    // there is no SQLSTATE to map — match the wording and answer with the same
    // guidance rather than "Veprimi nuk u krye. Provo sërish."
    const raw = (error.message ?? "").toLowerCase();
    if (/database error|foreign key|constraint|violates|conflict/.test(raw)) {
      return {
        ok: false,
        blocked: true,
        error: `Baza e të dhënave nuk e lejoi fshirjen — llogaria ka të dhëna që klubi i ruan (fatura, anëtarësi ose regjistrime). ${USE_DEACTIVATE}`,
      };
    }
    return { ok: false, error: dbError(error, "Fshirja e llogarisë dështoi. Provo sërish.") };
  }
  revalidatePath("/admin/people");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

// Derive the origin from the actual request so reset links point at the domain
// the admin is really using (not a possibly-stale NEXT_PUBLIC_SITE_URL). NOTE:
// Supabase only honours redirect_to if it's in Auth → URL Configuration → Redirect
// URLs; otherwise it falls back to the project's Site URL.
async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  } catch { /* not in a request scope */ }
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://kcprishtina038.vercel.app").replace(/\/$/, "");
}
async function resetRedirect(): Promise<string> { return `${await siteOrigin()}/auth/reset-password`; }

/** Change a member's login email (instant, no verification email). Syncs profiles.email. */
export async function updateMemberEmail(targetId: string, newEmail: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const email = (newEmail ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email-i nuk është i vlefshëm." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { error: aErr } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true });
  if (aErr) return { ok: false, error: /registered|exists|already/i.test(aErr.message) ? "Ky email është i zënë nga një llogari tjetër." : dbError(aErr, "Ndryshimi i email-it dështoi. Provo sërish.") };
  const { error: pErr } = await admin.from("profiles").update({ email }).eq("id", targetId);
  if (pErr) return { ok: false, error: dbError(pErr, "Email-i i hyrjes u ndryshua, por profili s’u sinkronizua.") };
  revalidatePath("/admin/people");
  return { ok: true };
}

/** Set a member's password directly (instant). */
export async function updateMemberPassword(targetId: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const password = newPassword ?? "";
  if (password.length < 8) return { ok: false, error: "Fjalëkalimi duhet të ketë së paku 8 karaktere." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { error } = await admin.auth.admin.updateUserById(targetId, { password });
  if (error) return { ok: false, error: dbError(error, "Ndryshimi i fjalëkalimit dështoi. Provo sërish.") };
  return { ok: true };
}

/** Email the member a password-reset link (needs email delivery configured). */
export async function sendPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail((email ?? "").trim().toLowerCase(), { redirectTo: await resetRedirect() });
  if (error) return { ok: false, error: dbError(error, "Dërgimi i email-it dështoi. Provo sërish.") };
  return { ok: true };
}

/** Generate a copyable recovery link (works without SMTP — admin delivers it). */
export async function generateResetLink(email: string): Promise<{ ok: boolean; link?: string; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: (email ?? "").trim().toLowerCase(), options: { redirectTo: await resetRedirect() } });
  if (error) return { ok: false, error: dbError(error, "Gjenerimi i lidhjes dështoi. Provo sërish.") };
  const link = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;
  if (!link) return { ok: false, error: "Nuk u gjenerua lidhja." };
  return { ok: true, link };
}
