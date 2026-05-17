"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function approveApplication(appId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("approve_application", { app_id: appId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function rejectApplication(appId: string, reason: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("reject_application", { app_id: appId, reason: reason ?? null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function setUserRole(targetId: string, newRole: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("set_user_role", { target_id: targetId, new_role: newRole });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/members");
  revalidatePath("/admin/staff");
  return { ok: true };
}
