import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, exchangeCode, revokeStrava, stravaIsConfigured } from "@/lib/strava-api";
import { removeImportedStravaData } from "@/lib/strava-cleanup";
import { enqueueRecentStravaActivities, processQueuedStravaActivities } from "@/lib/strava-sync";

export const maxDuration = 60;

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const destination = new URL("/portal/profile", request.url);
  const finish = (status: string) => {
    destination.searchParams.set("strava", status);
    const response = NextResponse.redirect(destination);
    response.cookies.set("strava_oauth_state", "", { maxAge: 0, path: "/api/strava/callback" });
    return response;
  };

  const profile = await getProfile();
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expected = request.cookies.get("strava_oauth_state")?.value ?? "";
  const code = request.nextUrl.searchParams.get("code");
  if (!profile || !state || !expected || !sameState(state, expected) || !state.startsWith(`${profile.id}.`)) {
    return finish("invalid-state");
  }
  if (!code || !stravaIsConfigured()) return finish("cancelled");

  try {
    const supabase = await createClient();
    const { data: rider } = await supabase.from("team_members")
      .select("id").eq("profile_id", profile.id).contains("positions", ["rider"]).maybeSingle();
    if (!rider) return finish("not-rider");

    const token = await exchangeCode(code);
    const granted = new Set((request.nextUrl.searchParams.get("scope") ?? token.scope ?? "").split(/[\s,]+/));
    if (!granted.has("activity:read_all")) return finish("scope-missing");

    const admin = createAdminClient();
    const { data: claimed, error: claimedError } = await admin.from("strava_connections")
      .select("athlete_id").eq("strava_athlete_id", token.athlete!.id).maybeSingle();
    if (claimedError) throw claimedError;
    if (claimed && claimed.athlete_id !== rider.id) return finish("already-connected");
    const { data: previous, error: previousError } = await admin.from("strava_connections")
      .select("*").eq("athlete_id", rider.id).maybeSingle();
    if (previousError) throw previousError;
    if (previous && previous.strava_athlete_id !== token.athlete!.id) {
      await removeImportedStravaData(rider.id);
      try { await revokeStrava(previous); }
      catch (error) { console.error("Old Strava connection revoke failed", error); }
    }
    const { error } = await admin.from("strava_connections").upsert({
      athlete_id: rider.id,
      profile_id: profile.id,
      strava_athlete_id: token.athlete!.id,
      access_token_ciphertext: encryptToken(token.access_token),
      refresh_token_ciphertext: encryptToken(token.refresh_token),
      access_expires_at: new Date(token.expires_at * 1000).toISOString(),
      scopes: [...granted].join(" "),
    }, { onConflict: "athlete_id" });
    if (error) throw error;
    after(async () => {
      try {
        await enqueueRecentStravaActivities(rider.id);
        await processQueuedStravaActivities(10);
      } catch (error) {
        console.error("Strava connection backfill failed", error);
      }
    });
    return finish("connected");
  } catch (error) {
    console.error("Strava connection failed", error);
    return finish("failed");
  }
}
