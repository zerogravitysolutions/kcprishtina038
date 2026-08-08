"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";

async function assertAdmin() {
  const p = await getProfile();
  if (!p || p.role !== "admin") throw new Error("forbidden");
  return p;
}

function parseValue(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  try { return JSON.parse(t); }
  catch { return t; }
}

export async function upsertSetting(form: FormData): Promise<void> {
  const me = await assertAdmin();
  const key = String(form.get("key") || "").trim();
  const raw = String(form.get("value") || "");
  if (!key) throw new Error("Çelësi mungon.");
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error("Çelësi duhet të jetë snake_case (a-z, 0-9, _).");
  const value = parseValue(raw);
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert([{
    key,
    value,
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  }] as never, { onConflict: "key" });
  if (error) throw new Error(dbError(error, "Ruajtja e cilësimit dështoi. Provo sërish."));
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}

export async function deleteSetting(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("settings").delete().eq("key", key);
    if (error) return { ok: false, error: dbError(error, "Fshirja e cilësimit dështoi. Provo sërish.") };
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
