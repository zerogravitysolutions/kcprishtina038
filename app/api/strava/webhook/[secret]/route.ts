import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { enqueueStravaActivity, processQueuedStravaActivities } from "@/lib/strava-sync";

export const maxDuration = 60;

type Params = { params: Promise<{ secret: string }> };
type StravaEvent = {
  object_type: "athlete" | "activity";
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  object_id: number;
  subscription_id: number;
  updates?: { authorized?: string; title?: string; type?: string; private?: string };
  event_time: number;
};

async function authorized({ params }: Params): Promise<boolean> {
  const expected = process.env.STRAVA_WEBHOOK_SECRET;
  const received = (await params).secret;
  if (!expected || !received) return false;
  const a = Buffer.from(expected), b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest, context: Params) {
  if (!await authorized(context) || request.nextUrl.searchParams.get("hub.mode") !== "subscribe" ||
      request.nextUrl.searchParams.get("hub.verify_token") !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(null, { status: 403 });
  }
  return NextResponse.json({ "hub.challenge": request.nextUrl.searchParams.get("hub.challenge") ?? "" });
}

export async function POST(request: NextRequest, context: Params) {
  if (!await authorized(context)) return new NextResponse(null, { status: 403 });
  const event = await request.json() as StravaEvent;
  if (String(event.subscription_id) !== process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID) {
    return new NextResponse(null, { status: 403 });
  }
  if (!Number.isSafeInteger(event.owner_id) || !Number.isSafeInteger(event.object_id)) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    if (event.object_type === "activity" ||
        (event.object_type === "athlete" && event.updates?.authorized === "false")) {
      const kind = event.object_type === "athlete" ? "revoke"
        : event.aspect_type === "delete" ? "delete" : "upsert";
      await enqueueStravaActivity(event.object_id, event.owner_id, event.event_time,
        event.aspect_type === "update" || kind !== "upsert", kind);
      after(async () => { await processQueuedStravaActivities(1); });
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Strava webhook failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
