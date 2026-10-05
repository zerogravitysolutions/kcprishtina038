"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeAvatarFiles, storeAvatar } from "@/lib/avatar";
import { dbError } from "@/lib/errors";

type Result = { ok: true; url: string | null } | { ok: false; error: string };

export async function uploadAvatar(formData: FormData): Promise<Result> {
  try {
    const profile = await getProfile();
    if (!profile) return { ok: false, error: "Identifikohu sërish dhe provo përsëri." };
    const file = formData.get("avatar");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Zgjidh një foto." };
    const url = await storeAvatar(profile.id, await file.arrayBuffer(), file.type, "upload");
    revalidatePath("/", "layout");
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: dbError(error, "Ngarkimi i fotos dështoi. Provo sërish.") };
  }
}

/** Remove the photo. A connected rider gets their Strava photo back with the
 * next daily Strava read. */
export async function removeAvatar(): Promise<Result> {
  try {
    const profile = await getProfile();
    if (!profile) return { ok: false, error: "Identifikohu sërish dhe provo përsëri." };
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    if (error) throw error;
    await removeAvatarFiles(profile.id);
    const { error: linkError } = await admin.from("strava_connections")
      .update({ strava_avatar_url: null, strava_ftp_checked_at: null }).eq("profile_id", profile.id);
    if (linkError) throw linkError;
    revalidatePath("/", "layout");
    return { ok: true, url: null };
  } catch (error) {
    return { ok: false, error: dbError(error, "Heqja e fotos dështoi. Provo sërish.") };
  }
}
