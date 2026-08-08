"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { dbError } from "@/lib/errors";

const MEMBER_ROLES = ["admin", "editor", "staff", "coach", "member"];
const MEMBER_STATUSES = ["active", "inactive", "suspended", "pending"];

/** Confirm the caller is a signed-in, ACTIVE admin. Returns their id or an error.
 * Re-reads role AND status every call so a demoted/deactivated admin loses access
 * immediately (Server Actions are standalone POST endpoints; the layout's status
 * gate never runs for them). */
async function requireAdmin(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nuk je i kyçur." };
  const { data } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const p = data as { role: string; status: string } | null;
  if (!p || p.status !== "active") return { ok: false, error: "Llogaria jote nuk është aktive." };
  if (p.role !== "admin") return { ok: false, error: "Vetëm admini mund ta bëjë këtë veprim." };
  return { ok: true, id: user.id };
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Call RPC inline on the supabase client. Extracting `supabase.rpc` into a
// local const breaks `this` binding — supabase-js's rpc() implementation
// accesses `this.rest`, so the detached call throws
// "Cannot read properties of undefined (reading 'rest')".
type RpcAny = (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

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
  const { error } = await (supabase.rpc as unknown as RpcAny).call(supabase, "approve_application", { app_id: appId });
  if (error) return { ok: false, error: rpcError(error, "Miratimi i aplikimit dështoi. Provo sërish.") };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function rejectApplication(appId: string, reason: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as RpcAny).call(supabase, "reject_application", { app_id: appId, reason: reason ?? null });
  if (error) return { ok: false, error: rpcError(error, "Refuzimi i aplikimit dështoi. Provo sërish.") };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function setUserRole(targetId: string, newRole: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as RpcAny).call(supabase, "set_user_role", { target_id: targetId, new_role: newRole });
  if (error) return { ok: false, error: rpcError(error, "Ndryshimi i rolit dështoi. Provo sërish.") };
  revalidatePath("/admin/members");
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
  const role = MEMBER_ROLES.includes(input.role) ? input.role : "member";
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

  revalidatePath("/admin/members");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

/** Activate / deactivate (or suspend) a member — flips profiles.status. */
export async function setMemberStatus(targetId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (targetId === gate.id) return { ok: false, error: "Nuk mund të çaktivizosh llogarinë tënde." };
  if (!MEMBER_STATUSES.includes(status)) return { ok: false, error: "Statusi nuk është i vlefshëm." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { error } = await admin.from("profiles").update({ status }).eq("id", targetId);
  if (error) return { ok: false, error: dbError(error, "Ndryshimi i statusit dështoi. Provo sërish.") };
  // Revoke (or restore) the auth session so a deactivated user is cut off
  // immediately everywhere — not just when a page/layout re-checks status.
  // Anything other than "active" bans the login; "active" lifts the ban.
  const { error: banErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: status === "active" ? "none" : "876000h" });
  if (banErr) return { ok: false, error: dbError(banErr, "Statusi u ndryshua, por sesioni s’u përditësua.") };
  revalidatePath("/admin/members");
  return { ok: true };
}

/** Permanently delete a member's auth user (profile cascades). */
export async function deleteMember(targetId: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (targetId === gate.id) return { ok: false, error: "Nuk mund të fshish llogarinë tënde." };

  let admin;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Mungon SUPABASE_SERVICE_ROLE_KEY në server." }; }
  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) return { ok: false, error: `${dbError(error, "Fshirja e llogarisë dështoi.")} Nëse llogaria ka të dhëna të lidhura, përdor “Çaktivizo”.` };
  revalidatePath("/admin/members");
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
  revalidatePath("/admin/members");
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
