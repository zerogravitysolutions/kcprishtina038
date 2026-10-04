"use server";

import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeStrava } from "@/lib/strava-api";
import { removeImportedStravaData } from "@/lib/strava-cleanup";

export async function disconnectStrava(): Promise<void> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: rider } = await supabase.from("team_members")
    .select("id").eq("profile_id", profile.id).contains("positions", ["rider"]).maybeSingle();
  if (!rider) redirect("/portal/profile?strava=not-rider");

  try {
    const admin = createAdminClient();
    const { data: connection } = await admin.from("strava_connections")
      .select("*").eq("athlete_id", rider.id).eq("profile_id", profile.id).maybeSingle();
    if (connection) {
      try {
        await revokeStrava(connection);
      } catch (error) {
        // Local disconnect and data removal must still succeed if Strava has
        // already revoked the token or its API is temporarily unavailable.
        console.error("Strava revoke failed during local disconnect", error);
      }
      await removeImportedStravaData(rider.id);
      const { error } = await admin.from("strava_connections").delete().eq("athlete_id", rider.id);
      if (error) throw error;
    }
  } catch (error) {
    console.error("Strava disconnect failed", error);
    redirect("/portal/profile?strava=disconnect-failed");
  }
  redirect("/portal/profile?strava=disconnected");
}
