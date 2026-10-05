import { NextRequest, NextResponse } from "next/server";
import { processFortyKmBackfills } from "@/lib/strava-forty-km-sync";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  try {
    return NextResponse.json(await processFortyKmBackfills());
  } catch (error) {
    console.error("Strava 40 km history sync failed", error);
    return NextResponse.json({ error: "Strava 40 km history sync failed" }, { status: 500 });
  }
}
