import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueRecentStravaActivities, processQueuedStravaActivities } from "@/lib/strava-sync";
import { processSegmentBackfills, refreshMissingSegmentSummaries } from "@/lib/strava-segment-sync";

export const maxDuration = 60;

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Called by pg_cron every few minutes while Strava work is due, so a
 * backfill drains without waiting for the daily Vercel cron. */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const { data: worker, error } = await admin.from("strava_queue_worker").select("secret, rescan_from, segments_refresh").maybeSingle();
  if (error) {
    console.error("Strava queue worker lookup failed", error);
    return new NextResponse(null, { status: 500 });
  }
  const given = request.headers.get("x-queue-secret") ?? "";
  if (!worker || !given || !sameSecret(given, worker.secret)) return new NextResponse(null, { status: 401 });

  after(async () => {
    try {
      if (worker.rescan_from) {
        const { error: clearError } = await admin.from("strava_queue_worker")
          .update({ rescan_from: null }).eq("rescan_from", worker.rescan_from);
        if (clearError) throw clearError;
        try { await enqueueRecentStravaActivities(undefined, worker.rescan_from); }
        catch (scanError) {
          await admin.from("strava_queue_worker").update({ rescan_from: worker.rescan_from }).is("rescan_from", null);
          throw scanError;
        }
      }
      await processQueuedStravaActivities(10);
      if (worker.segments_refresh) {
        // Cleared only after success, so a timed-out refresh is retried.
        await refreshMissingSegmentSummaries();
        const { error: flagError } = await admin.from("strava_queue_worker").update({ segments_refresh: false }).eq("id", true);
        if (flagError) throw flagError;
      }
      await processSegmentBackfills(new Date(Date.now() - 15 * 60_000).toISOString());
    } catch (cause) {
      console.error("Strava queue drain failed", cause);
    }
  });
  return new NextResponse(null, { status: 202 });
}
