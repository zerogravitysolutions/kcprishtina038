import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { authorizationUrl, stravaIsConfigured } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (!stravaIsConfigured()) return NextResponse.redirect(new URL("/portal/profile?strava=unconfigured", request.url));

  const supabase = await createClient();
  const { data: rider } = await supabase.from("team_members")
    .select("id").eq("profile_id", profile.id).contains("positions", ["rider"]).maybeSingle();
  if (!rider) return NextResponse.redirect(new URL("/portal/profile?strava=not-rider", request.url));

  const state = `${profile.id}.${randomBytes(24).toString("base64url")}`;
  const response = NextResponse.redirect(authorizationUrl(state));
  response.cookies.set("strava_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    maxAge: 600, path: "/api/strava/callback",
  });
  return response;
}
