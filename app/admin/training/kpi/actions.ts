"use server";

import { revalidatePath } from "next/cache";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { parseTargetField } from "@/lib/kpi";
import { clubTodayISO } from "@/lib/clubtime";
import { addMonths, monthStart } from "@/lib/kpi";

// Same bar as every other coaching write: admin / editor / staff / coach, with
// the account status re-read on each call (a Server Action is a standalone POST
// endpoint, so the admin layout's gate never runs for it).
const COACH_ROLES = ["admin", "editor", "staff", "coach"];

type Result = { ok: true } | { ok: false; error: string };

/**
 * Sets the whole team's weekly targets, from today on. There is no date to pick:
 * saving twice on the same day replaces that day's row, and an earlier row is
 * left alone, so a chart of an old week keeps the target that applied then.
 * An empty box means "no target for that KPI".
 */
export async function setTeamTargets(input: { weeklyHours: string; weeklyElevation: string }): Promise<Result> {
  try {
    const me = await getProfile();
    if (!me || me.status !== "active" || !COACH_ROLES.includes(me.role)) {
      return { ok: false, error: "Vetëm trajnerët dhe stafi mund t'i ndryshojnë targetet." };
    }

    const hours = parseTargetField(input.weeklyHours, "Orët në javë", 100, false);
    if (!hours.ok) return hours;
    const elevation = parseTargetField(input.weeklyElevation, "Ngjitja në javë", 20000, true);
    if (!elevation.ok) return elevation;
    if (hours.value == null && elevation.value == null) {
      return { ok: false, error: "Vendos të paktën një target: orët ose ngjitjen." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("team_kpi_targets").upsert(
      {
        effective_from: clubTodayISO(),
        weekly_hours: hours.value,
        weekly_elevation_m: elevation.value,
        created_by: me.id,
      },
      { onConflict: "effective_from" },
    );
    if (error) return { ok: false, error: dbError(error, "Ruajtja e targeteve dështoi. Provo sërish.") };

    revalidatePath("/admin/training/kpi");
    revalidatePath("/admin/athletes", "layout");
    revalidatePath("/portal/performance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}

// ------------------------------------------------------------------ 20-min power targets

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** More than every rider x every month the dialog offers; a bigger request is not from the dialog. */
const MAX_ITEMS = 500;

/** "YYYY-MM-DD" that is a real calendar day (rejects 2026-02-31). */
function isRealDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.getUTCFullYear() === Number(m[1]) && t.getUTCMonth() === Number(m[2]) - 1 && t.getUTCDate() === Number(m[3]);
}

/**
 * Saves the 20-minute power targets from the "Targetet FTP" dialog: one call for
 * every rider/month the coach changed. An empty value removes that month's target
 * (stored as no row, never as 0), which puts the rider back on the automatic
 * comparison with their own best of the previous month.
 */
export async function setFtpTargets(
  items: { athleteId: string; period: string; value: string }[],
): Promise<Result> {
  try {
    const me = await getProfile();
    if (!me || me.status !== "active" || !COACH_ROLES.includes(me.role)) {
      return { ok: false, error: "Vetëm trajnerët dhe stafi mund t'i ndryshojnë targetet." };
    }
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Nuk ka asnjë ndryshim për t'u ruajtur." };
    if (items.length > MAX_ITEMS) return { ok: false, error: "Shumë ndryshime njëherësh. Ruaji në pjesë." };

    // Targets may be set a little ahead and corrected a year back, not further.
    const thisMonth = monthStart(clubTodayISO());
    const lowest = addMonths(thisMonth, -12);
    const highest = addMonths(thisMonth, 1);

    const upserts: { athlete_id: string; period: string; target_w: number; created_by: string }[] = [];
    const removals = new Map<string, string[]>(); // period -> athlete ids
    for (const it of items) {
      const athleteId = String(it?.athleteId ?? "").trim();
      const period = String(it?.period ?? "").trim();
      if (!UUID_RE.test(athleteId)) return { ok: false, error: "Çiklisti nuk është i vlefshëm." };
      if (!isRealDate(period) || !period.endsWith("-01") || period < lowest || period > highest) {
        return { ok: false, error: "Muaji nuk është i vlefshëm." };
      }
      const w = parseTargetField(String(it?.value ?? ""), "Fuqia 20-min", 700, true);
      if (!w.ok) return w;
      if (w.value == null || w.value === 0) {
        removals.set(period, [...(removals.get(period) ?? []), athleteId]);
      } else {
        upserts.push({ athlete_id: athleteId, period, target_w: w.value, created_by: me.id });
      }
    }

    const supabase = await createClient();
    if (upserts.length > 0) {
      const { error } = await supabase.from("athlete_ftp_targets").upsert(upserts, { onConflict: "athlete_id,period" });
      if (error) return { ok: false, error: dbError(error, "Ruajtja e targeteve dështoi. Provo sërish.") };
    }
    for (const [period, ids] of removals) {
      const { error } = await supabase.from("athlete_ftp_targets").delete().eq("period", period).in("athlete_id", ids);
      if (error) return { ok: false, error: dbError(error, "Heqja e targeteve dështoi. Provo sërish.") };
    }

    revalidatePath("/admin/training/kpi");
    revalidatePath("/admin/athletes", "layout");
    revalidatePath("/portal/performance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
}
