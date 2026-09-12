import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
// Component + types only from the client module; values come from plain modules.
import { ApplicationActions, type ExistingMembership, type PlanOption } from "../ApplicationActions";
import { planAmountLabel } from "@/lib/finance";
import { clubTodayISO, lastBillingRunDay } from "@/lib/clubtime";
import { monthStartOf } from "@/app/admin/people/membership";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  age: number | null;
  experience: string | null;
  notes: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
  photo_storage_path: string | null;
  plan_id: string | null;
  section: { name_sq: string } | null;
  plan: { name_sq: string; amount_eur: number | string | null; billable: boolean } | null;
  reviewer: { full_name: string } | null;
};

const EXP_LABEL: Record<string, string> = {
  beginner:     "Fillestar — më pak se 1 vit",
  intermediate: "Mesatar — 1–3 vite",
  advanced:     "Garues aktiv — 3+ vite",
  racer:        "Garues",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Në pritje",
  approved: "Aprovuar",
  rejected: "Refuzuar",
};

// Who may open an application file at all.
const VIEW_ROLES = ["admin", "editor", "staff"];
// Who may act on it. approve_application / reject_application both require
// admin or staff in SQL and enrolApplication() re-checks the same bar, so an
// editor gets the file read-only instead of a form the server would refuse.
const ACT_ROLES = ["admin", "staff"];

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!VIEW_ROLES.includes(profile.role)) redirect("/admin/dashboard");
  const canAct = ACT_ROLES.includes(profile.role);
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("applications")
    .select("id, full_name, email, phone, age, experience, notes, status, reviewed_at, created_at, photo_storage_path, plan_id, section:sections(name_sq), plan:membership_plans(name_sq, amount_eur, billable), reviewer:profiles!reviewed_by(full_name)")
    .eq("id", id).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) notFound();

  // Tiers the admin can enrol into: the active ones, plus the applicant's own
  // choice even if that tier has since been deactivated.
  const { data: planData } = await supabase.from("membership_plans")
    .select("id, name_sq, amount_eur, billable, active, display_order")
    .order("display_order", { ascending: true });
  const allPlans = (planData as unknown as (PlanOption & { active: boolean })[] | null) ?? [];

  // The club's day and the billing job's progress, for the start-date default
  // and the note under it. Computed HERE: the form is a client component and a
  // clock read during its render would disagree with hydration around midnight.
  const today = clubTodayISO();
  const lastRunDay = lastBillingRunDay();

  // An active membership the applicant's account already holds — most often
  // because an earlier attempt of THIS enrolment opened it and then failed at
  // a later step. The form pre-fills from it so a retry sends the same start
  // date (the billing day) instead of a later "today". Read on the caller's
  // session: only admin/staff get the form, and RLS lets exactly them read.
  let existing: ExistingMembership | null = null;
  if (canAct && row.status === "pending") {
    const email = (row.email ?? "").trim().toLowerCase();
    const { data: acc } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    const accountId = (acc as { id: string } | null)?.id ?? null;
    if (accountId) {
      const { data: mData } = await supabase.from("memberships")
        .select("id, plan_id, amount_eur, start_date, created_at")
        .eq("member_id", accountId).eq("status", "active")
        .order("start_date", { ascending: false }).limit(1).maybeSingle();
      const m = mData as { id: string; plan_id: string; amount_eur: number | string | null; start_date: string; created_at: string } | null;
      if (m) {
        // One member: at most one dues row per month (unique member_id, period).
        const { data: dData } = await supabase.from("dues")
          .select("period").eq("member_id", accountId).order("period").limit(1200);
        existing = {
          planId: m.plan_id,
          planName: allPlans.find((p) => p.id === m.plan_id)?.name_sq ?? "Plan i arkivuar",
          amountEur: m.amount_eur,
          startDate: m.start_date,
          openedWhilePending: Date.parse(m.created_at) >= Date.parse(row.created_at),
          invoicedPeriods: ((dData as { period: string }[] | null) ?? [])
            .map((d) => monthStartOf(d.period))
            .filter((p): p is string => !!p),
        };
      }
    }
  }

  const plans: PlanOption[] = allPlans
    // The account's own tier stays selectable even if archived, or a retry
    // could not send what the first attempt wrote.
    .filter((p) => p.active || p.id === row.plan_id || p.id === existing?.planId)
    .map(({ id: planId, name_sq, amount_eur, billable }) => ({ id: planId, name_sq, amount_eur, billable }));

  // Split reviewer notes appended by reject_application from original applicant notes.
  let applicantNotes = row.notes ?? "";
  let reviewerNote: string | null = null;
  const m = applicantNotes.match(/\n\[reject reason\] (.*)$/s);
  if (m) {
    applicantNotes = applicantNotes.slice(0, m.index!).trimEnd();
    reviewerNote = m[1];
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{row.full_name}</h1>
          <div className="sub">
            Aplikoi {new Date(row.created_at).toLocaleDateString("sq", { day: "numeric", month: "long", year: "numeric" })} ·
            <span className={`badge-st ${row.status === "pending" ? "warn" : row.status === "approved" ? "ok" : "err"}`} style={{ marginLeft: 8 }}>{STATUS_LABEL[row.status] ?? row.status}</span>
          </div>
        </div>
        <Link className="btn btn-ghost" href="/admin/applications">← Kthehu te lista</Link>
      </div>

      <div className="cols">
        <div className="card">
          <div className="card-head"><h3>Detajet e aplikimit</h3></div>

          {row.photo_storage_path && (
            <div style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${row.photo_storage_path}`}
                alt={`Foto e profilit të ${row.full_name}`}
                style={{ width: 140, height: 175, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
              />
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".12em", textTransform: "uppercase", marginTop: 6 }}>
                Fotoja e profilit<br />
                <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${row.photo_storage_path}`} target="_blank" rel="noopener" style={{ color: "var(--ember)", letterSpacing: ".06em", textTransform: "none", fontSize: 12 }}>Hape në madhësi të plotë ↗</a>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, fontSize: 14 }}>
            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Email</div>
            <div><a href={`mailto:${row.email}`} style={{ color: "var(--ember)" }}>{row.email}</a></div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Telefoni</div>
            <div>{row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : <span style={{ color: "var(--ink-3)" }}>Pa numër telefoni</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Mosha</div>
            <div>{row.age ?? <span style={{ color: "var(--ink-3)" }}>E pashënuar</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Plani i zgjedhur</div>
            <div>
              {row.plan
                ? <>{row.plan.name_sq} <span style={{ color: "var(--ink-3)" }}>· {planAmountLabel(row.plan)}</span></>
                : <span style={{ color: "var(--ink-3)" }}>I pazgjedhur</span>}
            </div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Seksioni</div>
            <div>{row.section?.name_sq ?? <span style={{ color: "var(--ink-3)" }}>I pavendosur</span>}</div>

            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>Përvoja</div>
            <div>{row.experience ? (EXP_LABEL[row.experience] ?? row.experience) : <span style={{ color: "var(--ink-3)" }}>E pashënuar</span>}</div>
          </div>

          {applicantNotes && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Shënime nga aplikuesi</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{applicantNotes}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{canAct && row.status === "pending" ? "Aprovo dhe regjistro" : "Veprime"}</h3>
          </div>
          <ApplicationActions
            id={row.id}
            name={row.full_name}
            status={row.status}
            variant="detail"
            plans={plans}
            chosenPlanId={row.plan_id}
            canAct={canAct}
            today={today}
            lastRunDay={lastRunDay}
            existing={existing}
            canEditPlans={profile.role === "admin"}
          />

          {row.status !== "pending" && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 13 }}>
              <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Shqyrtuar nga</div>
              <div>
                {row.reviewer?.full_name ?? "Përdorues i panjohur"}
                {row.reviewed_at && <span style={{ color: "var(--ink-3)" }}> · {new Date(row.reviewed_at).toLocaleDateString("sq")}</span>}
              </div>
              {reviewerNote && (
                <div style={{ marginTop: 14 }}>
                  <div className="mono" style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Arsyeja e refuzimit</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{reviewerNote}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
