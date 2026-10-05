import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableRow } from "@/lib/supabase/types";

export type StravaConnection = TableRow<"strava_connections">;

export type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  trainer?: boolean;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  average_cadence?: number;
  athlete?: { id: number };
  segment_efforts?: StravaSegmentEffort[];
};

export type StravaSegmentEffort = {
  id: number;
  activity?: { id: number };
  athlete?: { id: number };
  segment?: { id: number };
  start_date: string;
  start_date_local: string;
  elapsed_time: number;
  moving_time?: number;
  distance?: number;
  average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  device_watts?: boolean;
};

export type StravaAthlete = { id: number; ftp?: number | null };

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
};

export function stravaIsConfigured(): boolean {
  const key = Buffer.from(process.env.STRAVA_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET &&
    process.env.STRAVA_REDIRECT_URI && key.length === 32 &&
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.STRAVA_WEBHOOK_SECRET &&
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN && process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID &&
    process.env.CRON_SECRET);
}

function config() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Strava nuk është konfiguruar.");
  const key = Buffer.from(process.env.STRAVA_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY duhet të jetë 32 bajtë në base64.");
  return { clientId, clientSecret, redirectUri, key };
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config().key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string): string {
  const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !body) throw new Error("Strava token i pavlefshëm.");
  const decipher = createDecipheriv("aes-256-gcm", config().key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function authorizationUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "activity:read_all,profile:read_all");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postToken(body: URLSearchParams): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = config();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", body, cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!response.ok) throw new Error(`Strava OAuth: ${response.status}`);
  return response.json() as Promise<StravaTokenResponse>;
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const token = await postToken(new URLSearchParams({ code, grant_type: "authorization_code" }));
  if (!token.athlete?.id || !token.access_token || !token.refresh_token) throw new Error("Përgjigje e paplotë nga Strava.");
  return token;
}

export async function accessToken(connection: StravaConnection): Promise<string> {
  if (Date.parse(connection.access_expires_at) > Date.now() + 60_000) {
    return decryptToken(connection.access_token_ciphertext);
  }
  const refreshed = await postToken(new URLSearchParams({
    refresh_token: decryptToken(connection.refresh_token_ciphertext),
    grant_type: "refresh_token",
  }));
  if (!refreshed.access_token || !refreshed.refresh_token) throw new Error("Rifreskimi i Strava dështoi.");
  const admin = createAdminClient();
  const { error } = await admin.from("strava_connections").update({
    access_token_ciphertext: encryptToken(refreshed.access_token),
    refresh_token_ciphertext: encryptToken(refreshed.refresh_token),
    access_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
  }).eq("athlete_id", connection.athlete_id);
  if (error) throw error;
  connection.access_token_ciphertext = encryptToken(refreshed.access_token);
  connection.refresh_token_ciphertext = encryptToken(refreshed.refresh_token);
  connection.access_expires_at = new Date(refreshed.expires_at * 1000).toISOString();
  return refreshed.access_token;
}

export async function stravaGet<T>(connection: StravaConnection, path: string): Promise<T> {
  const token = await accessToken(connection);
  const response = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (response.status === 429) throw new Error("U arrit kufiri i kërkesave në Strava. Provo më vonë.");
  if (!response.ok) throw new Error(`Strava API: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function revokeStrava(connection: StravaConnection): Promise<void> {
  const { clientId, clientSecret } = config();
  const response = await fetch("https://www.strava.com/oauth/revoke", {
    method: "POST", cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: decryptToken(connection.refresh_token_ciphertext), token_type_hint: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Strava revoke: ${response.status}`);
}
