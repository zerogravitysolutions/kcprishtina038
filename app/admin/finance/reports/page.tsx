import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { RowBars } from "../../training/charts";
import { BilledVsCollected, type TrendPoint } from "./TrendChart";
import {
  AGING_BUCKETS, AGING_BUCKET_LABEL, agingBucket, currentPeriod, daysOverdue,
  effectiveStatus, formatEur, isOutstanding, periodLabel, periodParam, planAmountLabel,
  shiftPeriod, sumEur, type AgingBucket, type DueLike,
} from "@/lib/finance";
import type { DuesStatus, MembershipStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Raportet e pagesave" };

// dues_select_staff / memberships_select_staff — admin + staff. Read-only page.
const FINANCE_ROLES = ["admin", "staff"];

type DueRow = DueLike & {
  id: string;
  member_id: string;
  amount_eur: number;
  status: DuesStatus;
  due_date: string | null;
  paid_at: string | null;
  membership_id: string | null;
};

type MembershipRow = {
  id: string; member_id: string; plan_id: string;
  amount_eur: number; billable: boolean; status: MembershipStatus;
  /** The period this row covers. end_date null = still running. */
  start_date: string; end_date: string | null;
};

type PlanRow = {
  id: string; code: string; name_sq: string;
  amount_eur: number | null; billable: boolean; display_order: number;
};

type ProfileRow = { id: string; full_name: string; email: string };

type PlanBucket = { billed: number; collected: number; outstanding: number };

function initials(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?";
}

function invoiceCount(n: number) {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

// "ditë" does not inflect for number in this construction.
function dayCount(n: number) {
  return `${n} ditë`;
}

/** "Gusht 2026" → "Gus", so the chart axis stays readable at 12 bars. */
function shortMonth(period: string) {
  return periodLabel(period).slice(0, 3);
}

export default async function FinanceReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const supabase = await createClient();
  const thisPeriod = currentPeriod();
  const windowStart = shiftPeriod(thisPeriod, -11);

  // Five flat selects, then all grouping in memory. A query per card would mean
  // a dozen round-trips over the same handful of rows, and pulling the whole
  // `dues` table would drag in years of settled history no card reports on. So:
  // every invoice of the last 12 months (the trend window, and where nearly all
  // live debt sits), plus older invoices ONLY while still open, plus the
  // membership/plan catalogue and the names needed to label them. No embeds —
  // the joins are three Maps below and cost nothing at club scale.
  const [recentRes, staleRes, membershipRes, planRes, profileRes] = await Promise.all([
    supabase
      .from("dues")
      .select("id, member_id, period, amount_eur, status, due_date, paid_at, membership_id")
      .gte("period", windowStart)
      .order("period", { ascending: true })
      .limit(5000),
    supabase
      .from("dues")
      .select("id, member_id, period, amount_eur, status, due_date, paid_at, membership_id")
      .lt("period", windowStart)
      .in("status", ["unpaid", "overdue"])
      .order("period", { ascending: true })
      .limit(5000),
    supabase
      .from("memberships")
      .select("id, member_id, plan_id, amount_eur, billable, status, start_date, end_date")
      .limit(2000),
    supabase
      .from("membership_plans")
      .select("id, code, name_sq, amount_eur, billable, display_order")
      .order("display_order", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email").limit(2000),
  ]);

  // Every figure on this page is a total, and a total that silently reads zero
  // is worse than no page at all — "nobody is behind" would be a lie told with
  // a green badge. So any failed select stops the render.
  const loadError =
    recentRes.error ?? staleRes.error ?? membershipRes.error ?? planRes.error ?? profileRes.error;
  if (loadError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Raportet e pagesave</h1>
            <div className="sub">Kush është prapa me pagesat dhe sa borxh ka mbetur pa u arkëtuar.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(loadError, "Leximi i të dhënave financiare dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Raporti nuk shfaqet me shifra të paplota, sepse një total i gabuar është më keq se asnjë total.
            Nëse kjo përsëritet, ka gjasa që skema e faturimit nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const recentDues = (recentRes.data as DueRow[] | null) ?? [];
  const staleDues = (staleRes.data as DueRow[] | null) ?? [];
  const memberships = (membershipRes.data as MembershipRow[] | null) ?? [];
  const plans = (planRes.data as PlanRow[] | null) ?? [];
  const profiles = (profileRes.data as ProfileRow[] | null) ?? [];

  const planById = new Map(plans.map((p) => [p.id, p]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const activeMemberships = memberships.filter((m) => m.status === "active");

  // Each member's membership rows, newest period first.
  const historyByMember = new Map<string, MembershipRow[]>();
  for (const m of memberships) {
    const list = historyByMember.get(m.member_id);
    if (list) list.push(m);
    else historyByMember.set(m.member_id, [m]);
  }
  for (const list of historyByMember.values()) {
    list.sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
  }

  // An invoice belongs to the membership that produced it. Rows written before
  // memberships existed (or whose membership was deleted) carry no
  // membership_id; for those, the honest fallback is the membership whose
  // window CONTAINS the billed month — not the rider's subscription today,
  // which would label a still-unpaid Akademia II month "Garues" the moment they
  // are promoted, on a page that also says racers are never billed. Both dates
  // are "YYYY-MM-DD", so comparing them as strings orders them correctly.
  function membershipOf(due: DueRow): MembershipRow | null {
    if (due.membership_id) {
      const byId = membershipById.get(due.membership_id);
      if (byId) return byId;
    }
    const history = historyByMember.get(due.member_id) ?? [];
    return history.find(
      (m) => m.start_date <= due.period && (!m.end_date || m.end_date >= due.period),
    ) ?? null;
  }

  function planOf(due: DueRow): PlanRow | null {
    const m = membershipOf(due);
    return m ? planById.get(m.plan_id) ?? null : null;
  }

  // A membership row is immutable once it has been invoiced: changing tier
  // CLOSES it and opens a new one (set_member_plan, migration 20260808000002).
  // So `own` is the membership the invoice was actually ISSUED under, not the
  // rider's tier today — the unpaid Akademia II balance of someone since
  // promoted to Garues still sits on a billable membership and is counted here
  // in full.
  //
  // What is left to drop is noise: competition riders are structurally outside
  // billing (neither the generator nor enrolment will invoice them), so a €0
  // row on a non-billable membership is a data fault that would otherwise show
  // a racer as "1 faturë e hapur" for nothing. An invoice that carries money
  // was issued to somebody and is real debt, so it is never hidden — this page
  // and /admin/finance, which does not filter at all, can never disagree about
  // a sum. Rows with no membership_id are legacy and were genuinely issued.
  const dues = [...recentDues, ...staleDues].filter((d) => {
    const own = d.membership_id ? membershipById.get(d.membership_id) : null;
    if (own && !own.billable) return (Number(d.amount_eur) || 0) > 0;
    return true;
  });

  const outstanding = dues.filter(isOutstanding);
  const outstandingTotalEur = sumEur(outstanding);

  // ---------------------------------------------------------------- debitorët
  type Debtor = {
    memberId: string; name: string; email: string; planName: string;
    count: number; oldest: DueRow; total: number;
  };
  const byMember = new Map<string, DueRow[]>();
  for (const d of outstanding) {
    const list = byMember.get(d.member_id);
    if (list) list.push(d);
    else byMember.set(d.member_id, [d]);
  }
  const debtors: Debtor[] = [...byMember.entries()].map(([memberId, rows]) => {
    const oldest = rows.reduce((a, b) => (a.period <= b.period ? a : b));
    // The tier the DEBT was issued under, not the one the rider is on today:
    // this column sits next to "fatura më e vjetër" and describes it. A rider
    // promoted to Garues who still owes for Akademia II must not read "Garues",
    // on a page whose own subtitle says racers are never billed.
    const plan = planOf(oldest);
    const p = profileById.get(memberId);
    return {
      memberId,
      name: p?.full_name ?? "Anëtar i panjohur",
      email: p?.email ?? "",
      planName: plan?.name_sq ?? "Pa plan",
      count: rows.length,
      oldest,
      total: sumEur(rows),
    };
  }).sort((a, b) => b.total - a.total || b.count - a.count);

  // There is no per-member page in the admin panel, so "link to the member"
  // means the invoice list scoped to them. /admin/finance takes `p` (period)
  // and `q` (name/email substring, matched inside that month) — landing on the
  // OLDEST open period puts the invoice that needs chasing on screen first.
  // Email is the needle when we have one; it cannot collide the way a name can.
  function debtorHref(d: Debtor) {
    const params = new URLSearchParams({ p: periodParam(d.oldest.period) });
    const needle = d.email || d.name;
    if (needle) params.set("q", needle);
    return `/admin/finance?${params.toString()}`;
  }

  // ---------------------------------------------------------------- vjetërsia
  const aging = new Map<AgingBucket, { count: number; amount: number }>(
    AGING_BUCKETS.map((b) => [b, { count: 0, amount: 0 }]),
  );
  let notYetDue = { count: 0, amount: 0 };
  for (const d of outstanding) {
    const bucket = agingBucket(d);
    const amount = Number(d.amount_eur) || 0;
    if (bucket) {
      const slot = aging.get(bucket)!;
      slot.count += 1;
      slot.amount += amount;
    } else {
      notYetDue = { count: notYetDue.count + 1, amount: notYetDue.amount + amount };
    }
  }
  const over60 = (aging.get("61-90")?.amount ?? 0) + (aging.get("90+")?.amount ?? 0);
  const over60Share = outstandingTotalEur > 0 ? Math.round((over60 / outstandingTotalEur) * 100) : 0;

  const agingBars = [
    ...AGING_BUCKETS.map((b) => {
      const slot = aging.get(b)!;
      return { label: AGING_BUCKET_LABEL[b], value: slot.amount, display: `${formatEur(slot.amount)} · ${invoiceCount(slot.count)}` };
    }),
    { label: "Ende brenda afatit", value: notYetDue.amount, display: `${formatEur(notYetDue.amount)} · ${invoiceCount(notYetDue.count)}` },
  ];

  // ------------------------------------------------------------ trendi mujor
  // Invoices are attributed to the month they bill, both when billed and when
  // collected, so a row reads "of what August charged, this much came in".
  // Waived invoices are excluded from billed as well as collected — they were
  // never meant to be collected and would otherwise depress the rate.
  const periods: string[] = [];
  for (let i = 0; i < 12; i++) periods.push(shiftPeriod(windowStart, i));
  const monthly = new Map<string, { billed: number; collected: number }>(
    periods.map((p) => [p, { billed: 0, collected: 0 }]),
  );
  for (const d of dues) {
    const slot = monthly.get(d.period);
    if (!slot) continue;
    const status = effectiveStatus(d);
    if (status === "waived") continue;
    const amount = Number(d.amount_eur) || 0;
    slot.billed += amount;
    if (status === "paid") slot.collected += amount;
  }
  const trend: TrendPoint[] = periods.map((p) => {
    const slot = monthly.get(p)!;
    return {
      label: shortMonth(p),
      full: periodLabel(p),
      billed: slot.billed,
      collected: slot.collected,
      billedLabel: formatEur(slot.billed),
      collectedLabel: formatEur(slot.collected),
      rate: slot.billed > 0 ? Math.round((slot.collected / slot.billed) * 100) : null,
    };
  });
  const billed12 = trend.reduce((s, t) => s + t.billed, 0);
  const collected12 = trend.reduce((s, t) => s + t.collected, 0);
  const rate12 = billed12 > 0 ? Math.round((collected12 / billed12) * 100) : null;
  const hasTrendData = billed12 > 0;

  // ------------------------------------------------------------- sipas planit
  const NO_PLAN = "__no_plan__";
  const planTotals = new Map<string, PlanBucket>();
  function planSlot(key: string): PlanBucket {
    let slot = planTotals.get(key);
    if (!slot) { slot = { billed: 0, collected: 0, outstanding: 0 }; planTotals.set(key, slot); }
    return slot;
  }
  for (const d of dues) {
    const key = planOf(d)?.id ?? NO_PLAN;
    const slot = planSlot(key);
    const amount = Number(d.amount_eur) || 0;
    const status = effectiveStatus(d);
    if (monthly.has(d.period) && status !== "waived") {
      slot.billed += amount;
      if (status === "paid") slot.collected += amount;
    }
    if (status === "unpaid" || status === "overdue") slot.outstanding += amount;
  }
  const activeByPlan = new Map<string, number>();
  for (const m of activeMemberships) activeByPlan.set(m.plan_id, (activeByPlan.get(m.plan_id) ?? 0) + 1);

  const planRows = plans.map((p) => {
    const totals = planTotals.get(p.id) ?? { billed: 0, collected: 0, outstanding: 0 };
    return {
      plan: p,
      active: activeByPlan.get(p.id) ?? 0,
      totals,
      // A non-billable tier normally has no money at all against it and reads
      // "Pa pagesë mujore". But if a figure DID land there — a hand-inserted
      // invoice, or a plan switched to non-billable after it had been invoiced
      // — the amount is shown instead of the sentence. A sum that appears in
      // the page total must never be missing from the table that explains it.
      showMoney: p.billable || totals.billed > 0 || totals.collected > 0 || totals.outstanding > 0,
    };
  });
  const orphan = planTotals.get(NO_PLAN);
  const hasOrphan = !!orphan && (orphan.billed > 0 || orphan.outstanding > 0);

  // ------------------------------------------------------------- headcount
  const payingActive = activeMemberships.filter((m) => m.billable).length;
  const nonBillableActive = activeMemberships.length - payingActive;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Raportet e pagesave</h1>
          <div className="sub">
            Kush është prapa me pagesat dhe sa borxh ka mbetur pa u arkëtuar. Të gjitha shumat
            llogariten vetëm mbi anëtarësitë me pagesë — garuesit nuk faturohen dhe nuk hyjnë
            as në borxh, as në normën e arkëtimit. <Link href="/admin/finance">Kthehu te faturat</Link>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          accent="#DC2626"
          label="Borxhi gjithsej"
          value={formatEur(outstandingTotalEur)}
          sub={outstanding.length === 0 ? "asnjë faturë e hapur" : `${invoiceCount(outstanding.length)} të hapura`}
        />
        <Kpi
          accent="#CA8A04"
          label="Mbi 60 ditë vonesë"
          value={formatEur(over60)}
          sub={outstandingTotalEur > 0 ? `${over60Share}% e borxhit` : "pa borxh të vjetër"}
        />
        <Kpi
          accent="#16A34A"
          label="Norma e arkëtimit"
          value={rate12 == null ? "Pa fatura" : `${rate12}%`}
          sub={rate12 == null ? "12 muajt e fundit" : `${formatEur(collected12)} nga ${formatEur(billed12)} · 12 muaj`}
        />
        <Kpi
          accent="#2E90FA"
          label="Anëtarësi aktive"
          value={String(activeMemberships.length)}
          sub={`${payingActive} me pagesë · ${nonBillableActive} garues pa pagesë`}
        />
      </div>

      {/* 1 — DEBITORËT */}
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h3>Debitorët</h3>
        <span className="kicker">renditur sipas borxhit</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Anëtari</th>
              <th>Plani</th>
              <th>Fatura të hapura</th>
              <th>Fatura më e vjetër</th>
              <th>Vonesa</th>
              <th className="num">Borxhi</th>
            </tr>
          </thead>
          <tbody>
            {debtors.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Askush nuk është prapa me pagesat — çdo faturë e lëshuar është e mbyllur.
                </td>
              </tr>
            ) : (
              debtors.map((d) => {
                const late = daysOverdue(d.oldest);
                return (
                  <tr key={d.memberId}>
                    <td>
                      <Link href={debtorHref(d)} className="person" title={`Faturat e ${d.name} për ${periodLabel(d.oldest.period)}`}>
                        <div className="avatar">{initials(d.name)}</div>
                        <div className="nm">{d.name}{d.email ? <small>{d.email}</small> : null}</div>
                      </Link>
                    </td>
                    <td data-lab="Plani">{d.planName}</td>
                    {/* Spelled out, not a bare number: under 800px the table
                        collapses to cards and the header row disappears. */}
                    <td className="mono" data-lab="Fatura të hapura">{invoiceCount(d.count)}</td>
                    <td className="mono" data-lab="Fatura më e vjetër">{periodLabel(d.oldest.period)}</td>
                    <td data-lab="Vonesa">
                      {late > 0
                        ? <span className={`badge-st ${late > 60 ? "err" : "warn"}`}>{dayCount(late)}</span>
                        : <span className="badge-st">Brenda afatit</span>}
                    </td>
                    <td className="num" data-lab="Borxhi" style={{ fontWeight: 600 }}>{formatEur(d.total)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* 2 — VJETËRSIA E BORXHIT */}
        <div className="card">
          <div className="card-head">
            <h3>Vjetërsia e borxhit</h3>
            <span className="kicker">ditë pas afatit</span>
          </div>
          {outstanding.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
              Nuk ka asnjë borxh të hapur. Çdo faturë e lëshuar është paguar ose falur.
            </p>
          ) : (
            <>
              <RowBars data={agingBars} color="#DC2626" />
              <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
                Borxhi gjithsej {formatEur(outstandingTotalEur)}, prej të cilit {formatEur(over60)} është
                mbi 60 ditë pas afatit ({over60Share}%).
              </p>
            </>
          )}
        </div>

        {/* 3 — TRENDI MUJOR */}
        <div className="card">
          <div className="card-head">
            <h3>Trendi mujor</h3>
            <span className="kicker">12 muajt e fundit</span>
          </div>
          {hasTrendData ? (
            <>
              <BilledVsCollected data={trend} />
              <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
                Faturuar {formatEur(billed12)}, arkëtuar {formatEur(collected12)} — normë arkëtimi {rate12}%.
                Faturat e falura nuk numërohen as si të faturuara, as si të arkëtuara.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
              Ende nuk është faturuar asgjë në 12 muajt e fundit. Trendi shfaqet sapo të gjenerohen faturat e para.
            </p>
          )}
        </div>
      </div>

      {/* 4 — SIPAS PLANIT */}
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h3>Sipas planit</h3>
        {/* The two windows differ on purpose: revenue is a 12-month view, but a
            debt is a debt no matter how old, so the unpaid column is never truncated. */}
        <span className="kicker">faturuar dhe arkëtuar: 12 muajt e fundit · pa arkëtuar: të gjitha kohërat</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Plani</th>
              <th>Anëtarë aktivë</th>
              <th>Çmimi</th>
              <th className="num">Faturuar</th>
              <th className="num">Arkëtuar</th>
              <th className="num">Pa arkëtuar</th>
            </tr>
          </thead>
          <tbody>
            {planRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Ende nuk është krijuar asnjë plan anëtarësie.
                </td>
              </tr>
            ) : (
              planRows.map(({ plan, active, totals, showMoney }) => (
                <tr key={plan.id}>
                  <td style={{ fontWeight: 600 }}>{plan.name_sq}</td>
                  <td className="mono" data-lab="Anëtarë aktivë">{active === 1 ? "1 anëtar" : `${active} anëtarë`}</td>
                  <td className="mono" data-lab="Çmimi">{planAmountLabel(plan)}</td>
                  {showMoney ? (
                    <>
                      <td className="num" data-lab="Faturuar">{formatEur(totals.billed)}</td>
                      <td className="num" data-lab="Arkëtuar">{formatEur(totals.collected)}</td>
                      <td className="num" data-lab="Pa arkëtuar" style={{ fontWeight: totals.outstanding > 0 ? 600 : 400, color: totals.outstanding > 0 ? "var(--err)" : undefined }}>
                        {formatEur(totals.outstanding)}
                      </td>
                    </>
                  ) : (
                    <td className="num" colSpan={3} data-lab="Faturimi" style={{ color: "var(--text-3)" }}>Pa pagesë mujore</td>
                  )}
                </tr>
              ))
            )}
            {hasOrphan && orphan ? (
              <tr>
                <td style={{ fontWeight: 600 }}>Pa plan</td>
                <td className="mono" data-lab="Anëtarë aktivë">0 anëtarë</td>
                <td className="mono" data-lab="Çmimi" style={{ color: "var(--text-3)" }}>Fatura pa anëtarësi</td>
                <td className="num" data-lab="Faturuar">{formatEur(orphan.billed)}</td>
                <td className="num" data-lab="Arkëtuar">{formatEur(orphan.collected)}</td>
                <td className="num" data-lab="Pa arkëtuar">{formatEur(orphan.outstanding)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 5 — TOTALI */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="kicker">Borxhi gjithsej</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, letterSpacing: "-0.02em", marginTop: 6 }}>
            {formatEur(outstandingTotalEur)}
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-3)", maxWidth: "56ch" }}>
          {outstandingTotalEur > 0
            ? <>Prej tij {formatEur(over60)} ({over60Share}%) është mbi 60 ditë pas afatit dhe kërkon ndjekje të menjëhershme.</>
            : <>Nuk ka asnjë euro të paarkëtuar — të gjitha faturat e lëshuara janë të mbyllura.</>}
            {" "}
          {nonBillableActive > 0
            ? <>Përveç kësaj, {nonBillableActive} garues janë aktivë në një plan pa pagesë dhe nuk faturohen fare.</>
            : null}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi">
      <div className="lab" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {accent ? <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} /> : null}
        {label}
      </div>
      <div className="val">{value}</div>
      {sub ? <div className="delta">{sub}</div> : null}
    </div>
  );
}
