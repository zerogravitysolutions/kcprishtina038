import { NextRequest, NextResponse } from "next/server";
import { enqueueRecentStravaActivities, processQueuedStravaActivities } from "@/lib/strava-sync";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  try {
    const scanned = await enqueueRecentStravaActivities();
    const result = await processQueuedStravaActivities(10);
    return NextResponse.json({ scanned, ...result });
  } catch (error) {
    console.error("Scheduled Strava sync failed", error);
    return NextResponse.json({ error: "Strava sync failed" }, { status: 500 });
  }
}
