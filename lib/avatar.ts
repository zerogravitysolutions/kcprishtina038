import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { StravaConnection } from "@/lib/strava-api";
import { UserError } from "@/lib/errors";

// Profile photos live in the public avatars bucket under "<profile id>/".
// The file name records the source: "strava-…" photos follow the Strava
// profile, "upload-…" photos were chosen by the member and are never replaced
// by Strava.

const BUCKET = "avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const isUploadedAvatar = (url: string | null | undefined) => !!url && url.includes("/upload-");

/** Replace the profile photo and delete the previous files. */
export async function storeAvatar(profileId: string, bytes: ArrayBuffer, contentType: string,
  source: "strava" | "upload"): Promise<string> {
  const ext = TYPES[contentType];
  if (!ext) throw new UserError("Fotoja duhet të jetë JPG, PNG ose WebP.");
  if (bytes.byteLength > MAX_BYTES) throw new UserError("Fotoja është më e madhe se 5 MB.");
  const admin = createAdminClient();
  const path = `${profileId}/${source}-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: profileError } = await admin.from("profiles").update({ avatar_url: url }).eq("id", profileId);
  if (profileError) throw profileError;
  await removeAvatarFiles(profileId, path);
  return url;
}

export async function removeAvatarFiles(profileId: string, keep?: string): Promise<void> {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from(BUCKET).list(profileId);
  const stale = (files ?? []).map((file) => `${profileId}/${file.name}`).filter((path) => path !== keep);
  if (stale.length) await admin.storage.from(BUCKET).remove(stale);
}

/** Copy the rider's Strava photo unless they uploaded their own, Strava only
 * has its default placeholder, or this exact photo was already copied. */
export async function syncStravaAvatar(connection: StravaConnection, stravaUrl: string | null | undefined): Promise<void> {
  if (!stravaUrl || !/^https:\/\//.test(stravaUrl) || stravaUrl.includes("avatar/athlete/")) return;
  if (stravaUrl === connection.strava_avatar_url) return;
  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("avatar_url")
    .eq("id", connection.profile_id).maybeSingle();
  if (error) throw error;
  if (!profile || isUploadedAvatar(profile.avatar_url)) return;
  const response = await fetch(stravaUrl, { cache: "no-store" });
  if (!response.ok) return;
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!TYPES[contentType]) return;
  await storeAvatar(connection.profile_id, await response.arrayBuffer(), contentType, "strava");
  const { error: linkError } = await admin.from("strava_connections")
    .update({ strava_avatar_url: stravaUrl }).eq("athlete_id", connection.athlete_id);
  if (linkError) throw linkError;
  connection.strava_avatar_url = stravaUrl;
}
