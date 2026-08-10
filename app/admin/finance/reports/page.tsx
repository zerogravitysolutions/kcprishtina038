import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { RowBars } from "../../training/charts";
import { BilledVsCollected, type TrendPoint } from "./TrendChart";
import { MembershipFlow, type GrowthPoint } from "./GrowthChart";
import {
  AGING_BUCKETS, AGING_BUCKET_LABEL, PAID_METHOD_LABEL, agingBucket, averageEur,
  collectionRate, coveringMemberships, currentPeriod, daysOverdue, effectiveStatus,
  formatEur, isBillable, isOutstanding, isTierChangeGap, parsePeriodParam, periodLabel,
  periodOfTimestamp, periodParam, periodRange, planAmountLabel, shiftPeriod, sumEur,
  toEuros, yearStartPeriod, type AgingBucket, type DueLike,
} from "@/lib/finance";
import type { DuesStatus, MembershipStatus, PaidMethod } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Raportet financiare" };

// dues_select_staff / memberships_select_staff — admin + staff. Read-only page.
const FINANCE_ROLES = ["admin", "staff"];

// Caps. Every one of them is surfaced in the UI when it bites (see `truncated`
// below): a total that was quietly cut short is not a total, it is a lie with a
// euro sign in front of it. At club scale none of these are reached.
const DUES_CAP = 5000;
const OPEN_CAP = 5000;
const MEMBERSHIP_CAP = 4000;
const PROFILE_CAP = 4000;

const DUES_SELECT =
  "id, member_id, period, amount_eur, status, due_date, paid_at, paid_method, membership_id";

type DueRow = DueLike & {
  id: string;
  member_id: string;
  amount_eur: number;
  status: DuesStatus;
  due_date: string | null;
  paid_at: string | null;
  paid_method: PaidMethod | null;
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

/** Everything one month contributes to the report, in one pass over the rows. */
type MonthAgg = {
  /** Invoiced FOR this month, waived excluded. */
  billed: number; billedCount: number;
  /** Of those invoices, the ones already paid. */
  collected: number; collectedCount: number;
  /** Of those invoices, the ones still open. */
  outstanding: number; outstandingCount: number;
  /** Forgiven: neither income nor debt, reported on its own. */
  waived: number; waivedCount: number;
  /** Money that ARRIVED during this calendar month, whatever it paid for. */
  cash: number; cashCount: number;
};

function emptyMonth(): MonthAgg {
  return {
    billed: 0, billedCount: 0, collected: 0, collectedCount: 0,
    outstanding: 0, outstandingCount: 0, waived: 0, waivedCount: 0, cash: 0, cashCount: 0,
  };
}

function initials(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?";
}

function invoiceCount(n: number) {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

function memberCount(n: number) {
  return `${n} ${n === 1 ? "anëtar" : "anëtarë"}`;
}

function paymentCount(n: number) {
  return `${n} ${n === 1 ? "pagesë" : "pagesa"}`;
}

// "ditë" does not inflect for number in this construction.
function dayCount(n: number) {
  return `${n} ditë`;
}

/** "Gusht 2026" → "Gus", so the chart axis stays readable at 12 bars. */
function shortMonth(period: string) {
  return periodLabel(period).slice(0, 3);
}

/** "2026-08-14" → "2026-08-01", the month a date falls in. */
function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** A rate as text, with the reason in words when there is no rate to show. */
function rateLabel(rate: number | null): string {
  return rate == null ? "Pa fatura" : `${rate}%`;
}

type SearchParams = Promise<{ p?: string }>;

export default async function FinanceReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const period = parsePeriodParam(sp.p);
  const thisMonth = currentPeriod();
  const windowStart = shiftPeriod(period, -11);
  const nextPeriod = shiftPeriod(period, 1);
  const ytdStart = yearStartPeriod(period);       // never before windowStart: at
  const periods = periodRange(windowStart, 12);   // most 11 months back.

  const supabase = await createClient();

  // SIX flat selects, then every grouping in memory. Why these six and not one
  // per card: the page asks eight questions of the same three tables, and a
  // query per card would be twenty round-trips over a few thousand rows. Why
  // not one big select either: the whole `dues` table would drag in years of
  // settled invoices that no section reports on. So each select is one SHAPE of
  // question, and no two sections share a source they would have to de-duplicate:
  //   1. window   — every invoice billed inside the 12-month window. Drives
  //                 billed / collected-of-that-month / trend / per-plan revenue.
  //   2. cash     — invoices whose PAYMENT landed in the window, by paid_at.
  //                 A different question from (1): an August payment of a May
  //                 invoice is August cash and May revenue, and conflating the
  //                 two is the classic way a finance page starts lying.
  //   3. open     — every still-unpaid invoice, ALL periods. Debt is debt no
  //                 matter how old, so this one is never windowed.
  //   4/5/6       — the membership catalogue (recurring income and growth come
  //                 from here, not from dues), the plans, and the names needed
  //                 to label debtors. No PostgREST embeds: the joins are three
  //                 Maps below and cost nothing at club scale.
  const [windowRes, cashRes, openRes, membershipRes, planRes, profileRes] = await Promise.all([
    supabase
      .from("dues")
      .select(DUES_SELECT)
      .gte("period", windowStart)
      .lte("period", period)
      .order("period", { ascending: true })
      .limit(DUES_CAP),
    supabase
      .from("dues")
      .select(DUES_SELECT)
      .eq("status", "paid")
      .gte("paid_at", windowStart)
      .lt("paid_at", nextPeriod)
      .order("paid_at", { ascending: true })
      .limit(DUES_CAP),
    supabase
      .from("dues")
      .select(DUES_SELECT)
      .in("status", ["unpaid", "overdue"])
      .order("period", { ascending: true })
      .limit(OPEN_CAP),
    supabase
      .from("memberships")
      .select("id, member_id, plan_id, amount_eur, billable, status, start_date, end_date")
      .order("start_date", { ascending: true })
      .limit(MEMBERSHIP_CAP),
    supabase
      .from("membership_plans")
      .select("id, code, name_sq, amount_eur, billable, display_order")
      .order("display_order", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email").limit(PROFILE_CAP),
  ]);

  // Every figure on this page is a total, and a total that silently reads zero
  // is worse than no page at all — "nobody is behind" would be a lie told with
  // a green badge. So any failed select stops the render.
  const loadError =
    windowRes.error ?? cashRes.error ?? openRes.error
    ?? membershipRes.error ?? planRes.error ?? profileRes.error;
  if (loadError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Raportet financiare</h1>
            <div className="sub">Të hyrat, anëtarësitë dhe borxhi i akademisë.</div>
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

  const rawWindow = (windowRes.data as DueRow[] | null) ?? [];
  const rawCash = (cashRes.data as DueRow[] | null) ?? [];
  const rawOpen = (openRes.data as DueRow[] | null) ?? [];
  const memberships = (membershipRes.data as MembershipRow[] | null) ?? [];
  const plans = (planRes.data as PlanRow[] | null) ?? [];
  const profiles = (profileRes.data as ProfileRow[] | null) ?? [];

  const planById = new Map(plans.map((p) => [p.id, p]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

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
  // So the row an invoice points at is the one it was ISSUED under, not the
  // rider's tier today — the unpaid Akademia II balance of someone since
  // promoted to Garues still sits on a billable membership and is counted here
  // in full.
  //
  // What is dropped is noise: competition riders are structurally outside
  // billing, so a €0 row on a non-billable membership is a data fault that
  // would otherwise show a racer as "1 faturë" for nothing. An invoice that
  // carries money was issued to somebody and is real, so it is never hidden —
  // this page and /admin/finance, which does not filter at all, can never
  // disagree about a sum.
  function isRealInvoice(d: DueRow): boolean {
    const own = d.membership_id ? membershipById.get(d.membership_id) : null;
    if (own && !own.billable) return toEuros(d.amount_eur) > 0;
    return true;
  }

  const windowDues = rawWindow.filter(isRealInvoice);
  const openDues = rawOpen.filter(isRealInvoice);

  // ------------------------------------------------------------------- cash in
  // Cash is bucketed by the month the payment LANDED in. Two wrinkles:
  //   - paid_at is a timestamptz, so a payment near midnight can land in the
  //     neighbouring month once read in local time; anything that falls outside
  //     the window is dropped rather than folded into an edge month.
  //   - legacy rows are marked paid with no paid_at at all. Their money exists,
  //     so they are counted in the month they BILL, and the page says so.
  type CashRow = DueRow & { cashPeriod: string };
  const datedCash: CashRow[] = rawCash
    .filter(isRealInvoice)
    .map((d) => ({ ...d, cashPeriod: periodOfTimestamp(d.paid_at) ?? d.period }))
    .filter((c) => c.cashPeriod >= windowStart && c.cashPeriod <= period);
  const undatedPaid = windowDues.filter((d) => effectiveStatus(d) === "paid" && !d.paid_at);
  const cashRows: CashRow[] = [
    ...datedCash,
    ...undatedPaid.map((d) => ({ ...d, cashPeriod: d.period })),
  ];

  // -------------------------------------------------------------- month totals
  const monthly = new Map<string, MonthAgg>(periods.map((p) => [p, emptyMonth()]));
  for (const d of windowDues) {
    const slot = monthly.get(d.period);
    if (!slot) continue;
    const amount = toEuros(d.amount_eur);
    const status = effectiveStatus(d);
    // A waived invoice is neither income nor debt. Excluding it from `billed`
    // as well as from `collected` is what keeps the rate honest: counting it as
    // billed would make forgiveness look like a collection failure.
    if (status === "waived") {
      slot.waived += amount;
      slot.waivedCount += 1;
      continue;
    }
    slot.billed += amount;
    slot.billedCount += 1;
    if (status === "paid") {
      slot.collected += amount;
      slot.collectedCount += 1;
    } else {
      slot.outstanding += amount;
      slot.outstandingCount += 1;
    }
  }
  for (const c of cashRows) {
    const slot = monthly.get(c.cashPeriod);
    if (!slot) continue;
    slot.cash += toEuros(c.amount_eur);
    slot.cashCount += 1;
  }

  const month = monthly.get(period) ?? emptyMonth();
  const monthRate = collectionRate(month.collected, month.billed);

  const ytdPeriods = periods.filter((p) => p >= ytdStart && p <= period);
  const ytd = ytdPeriods.reduce<MonthAgg>((acc, p) => {
    const s = monthly.get(p) ?? emptyMonth();
    return {
      billed: acc.billed + s.billed, billedCount: acc.billedCount + s.billedCount,
      collected: acc.collected + s.collected, collectedCount: acc.collectedCount + s.collectedCount,
      outstanding: acc.outstanding + s.outstanding, outstandingCount: acc.outstandingCount + s.outstandingCount,
      waived: acc.waived + s.waived, waivedCount: acc.waivedCount + s.waivedCount,
      cash: acc.cash + s.cash, cashCount: acc.cashCount + s.cashCount,
    };
  }, emptyMonth());
  const ytdRate = collectionRate(ytd.collected, ytd.billed);
  const ytdLabel = ytdPeriods.length <= 1
    ? `Viti ${period.slice(0, 4)} · ${periodLabel(period)}`
    : `Viti ${period.slice(0, 4)} · ${periodLabel(ytdStart).split(" ")[0].toLowerCase()}–${periodLabel(period).split(" ")[0].toLowerCase()}`;

  // ------------------------------------------------- recurring monthly income
  // From MEMBERSHIPS, not from dues: this is what the club should invoice from
  // here on, whether or not this month's invoices have been generated yet. The
  // pick mirrors generate_dues_for_period exactly (coveringMemberships), so the
  // figure is what the generator will actually raise, not an optimistic count
  // of everyone who ever enrolled. Always read for the CURRENT month — it is a
  // forward-looking number and does not move when you browse an older month.
  const covering = coveringMemberships(memberships, thisMonth);
  const payingNow = covering.filter(isBillable);
  const waivedNow = covering.filter((m) => m.billable && toEuros(m.amount_eur) <= 0);
  const racersNow = covering.filter((m) => !m.billable);
  const expectedMonthly = sumEur(payingNow);
  const averagePaying = averageEur(expectedMonthly, payingNow.length);

  // -------------------------------------------------------------- trend (12 m)
  const trend: TrendPoint[] = periods.map((p) => {
    const s = monthly.get(p) ?? emptyMonth();
    return {
      label: shortMonth(p),
      full: periodLabel(p),
      billed: s.billed,
      collected: s.collected,
      cash: s.cash,
      billedLabel: formatEur(s.billed),
      collectedLabel: formatEur(s.collected),
      cashLabel: formatEur(s.cash),
      rate: collectionRate(s.collected, s.billed),
    };
  });
  const billed12 = trend.reduce((s, t) => s + t.billed, 0);
  const collected12 = trend.reduce((s, t) => s + t.collected, 0);
  const cash12 = trend.reduce((s, t) => s + t.cash, 0);
  const rate12 = collectionRate(collected12, billed12);
  const hasTrendData = billed12 > 0 || cash12 > 0;

  // ------------------------------------------------------------- sipas planit
  const NO_PLAN = "__no_plan__";
  type PlanBucket = { billed: number; collected: number; outstanding: number };
  const planTotals = new Map<string, PlanBucket>();
  function planSlot(key: string): PlanBucket {
    let slot = planTotals.get(key);
    if (!slot) { slot = { billed: 0, collected: 0, outstanding: 0 }; planTotals.set(key, slot); }
    return slot;
  }
  for (const d of windowDues) {
    const status = effectiveStatus(d);
    if (status === "waived") continue;
    const slot = planSlot(planOf(d)?.id ?? NO_PLAN);
    const amount = toEuros(d.amount_eur);
    slot.billed += amount;
    if (status === "paid") slot.collected += amount;
  }
  // Outstanding comes from the all-periods select, so an old debt is never
  // truncated by the 12-month revenue window.
  for (const d of openDues) {
    planSlot(planOf(d)?.id ?? NO_PLAN).outstanding += toEuros(d.amount_eur);
  }

  const headByPlan = new Map<string, { members: number; expected: number; paying: number }>();
  for (const m of covering) {
    const slot = headByPlan.get(m.plan_id) ?? { members: 0, expected: 0, paying: 0 };
    slot.members += 1;
    if (isBillable(m)) { slot.paying += 1; slot.expected += toEuros(m.amount_eur); }
    headByPlan.set(m.plan_id, slot);
  }

  const planRows = plans.map((p) => {
    const totals = planTotals.get(p.id) ?? { billed: 0, collected: 0, outstanding: 0 };
    const head = headByPlan.get(p.id) ?? { members: 0, expected: 0, paying: 0 };
    return {
      plan: p,
      head,
      totals,
      // A non-billable tier normally has no money at all against it and reads
      // "Pa pagesë". But if a figure DID land there — a hand-inserted invoice,
      // or a plan switched to non-billable after it had been invoiced — the
      // amount is shown instead of the sentence. A sum that appears in a page
      // total must never be missing from the table that explains it.
      showMoney: p.billable || totals.billed > 0 || totals.collected > 0 || totals.outstanding > 0,
    };
  });
  const orphan = planTotals.get(NO_PLAN);
  const hasOrphan = !!orphan && (orphan.billed > 0 || orphan.outstanding > 0);

  // ------------------------------------------------------------------ rritja
  // A tier change closes one membership row and opens another the next day, so
  // counting starts and ends naively reports every promotion as one departure
  // plus one arrival — the growth chart would then say the academy churns hard
  // exactly in the months it is doing best. Pair them up first: same member, a
  // row that ended and a row that started within a month of it.
  const pairedStart = new Set<string>();
  const pairedEnd = new Set<string>();
  const tierChanges = new Map<string, number>();
  for (const [, rows] of historyByMember) {
    if (rows.length < 2) continue;
    // rows are newest-start first; oldest-first reads better for pairing.
    const byStart = [...rows].sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
    for (const ended of byStart) {
      if (!ended.end_date || pairedEnd.has(ended.id)) continue;
      const next = byStart.find(
        (s) => s.id !== ended.id && !pairedStart.has(s.id) && isTierChangeGap(ended.end_date!, s.start_date),
      );
      if (!next) continue;
      pairedEnd.add(ended.id);
      pairedStart.add(next.id);
      // Attributed to the month the NEW tier began — that is when the change
      // took effect for the member and for the invoice that follows it.
      const p = monthOf(next.start_date);
      tierChanges.set(p, (tierChanges.get(p) ?? 0) + 1);
    }
  }

  const joins = new Map<string, number>();
  const leaves = new Map<string, number>();
  for (const m of memberships) {
    if (!pairedStart.has(m.id)) {
      const p = monthOf(m.start_date);
      joins.set(p, (joins.get(p) ?? 0) + 1);
    }
    if (m.end_date && !pairedEnd.has(m.id)) {
      const p = monthOf(m.end_date);
      leaves.set(p, (leaves.get(p) ?? 0) + 1);
    }
  }

  // Paying headcount at each month, by the same coverage rule as the invoice
  // generator — 13 passes over a few thousand rows, all in memory. The month
  // before the window is computed too, so the first bar has a real net change
  // instead of a fake jump from zero.
  const payingAt = new Map<string, number>();
  for (const p of [shiftPeriod(windowStart, -1), ...periods]) {
    payingAt.set(p, coveringMemberships(memberships, p).filter(isBillable).length);
  }

  const growth: GrowthPoint[] = periods.map((p) => {
    const paying = payingAt.get(p) ?? 0;
    const before = payingAt.get(shiftPeriod(p, -1)) ?? 0;
    return {
      label: shortMonth(p),
      full: periodLabel(p),
      joined: joins.get(p) ?? 0,
      left: leaves.get(p) ?? 0,
      changed: tierChanges.get(p) ?? 0,
      paying,
      net: paying - before,
    };
  });
  const joined12 = growth.reduce((s, g) => s + g.joined, 0);
  const left12 = growth.reduce((s, g) => s + g.left, 0);
  const changed12 = growth.reduce((s, g) => s + g.changed, 0);
  const net12 = (payingAt.get(period) ?? 0) - (payingAt.get(shiftPeriod(windowStart, -1)) ?? 0);
  const hasGrowthData = joined12 > 0 || left12 > 0 || changed12 > 0;

  // -------------------------------------------------------- mënyrat e pagesës
  const UNRECORDED = "__unrecorded__";
  const METHOD_ORDER: PaidMethod[] = ["cash", "bank", "online"];
  // Anything that is not one of the three real methods lands in the residual
  // bucket rather than in a key nothing renders. Null is the everyday case; the
  // other one is paid_method = 'waived' left behind on a row later marked paid
  // by hand, which would otherwise vanish from the bars while still being
  // counted in `month.cash` — bars that do not add up to the total beneath them.
  function methodKey(m: PaidMethod | null): string {
    return m && (METHOD_ORDER as string[]).includes(m) ? m : UNRECORDED;
  }
  function methodSplit(rows: CashRow[]) {
    const totals = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
      const key = methodKey(r.paid_method);
      const slot = totals.get(key) ?? { amount: 0, count: 0 };
      slot.amount += toEuros(r.amount_eur);
      slot.count += 1;
      totals.set(key, slot);
    }
    return totals;
  }
  const monthMethods = methodSplit(cashRows.filter((c) => c.cashPeriod === period));
  const windowMethods = methodSplit(cashRows);
  const methodBars = [
    ...METHOD_ORDER.map((m) => {
      const slot = monthMethods.get(m) ?? { amount: 0, count: 0 };
      const share = month.cash > 0 ? Math.round((slot.amount / month.cash) * 100) : 0;
      return {
        label: PAID_METHOD_LABEL[m],
        value: slot.amount,
        display: `${formatEur(slot.amount)} · ${share}%`,
      };
    }),
    ...(monthMethods.has(UNRECORDED)
      ? [{
          label: "Pa mënyrë të shënuar",
          value: monthMethods.get(UNRECORDED)!.amount,
          display: `${formatEur(monthMethods.get(UNRECORDED)!.amount)} · ${paymentCount(monthMethods.get(UNRECORDED)!.count)}`,
        }]
      : []),
  ];

  // ---------------------------------------------------------------- debitorët
  const outstandingAll = openDues.filter(isOutstanding);
  const outstandingTotalEur = sumEur(outstandingAll);

  type Debtor = {
    memberId: string; name: string; email: string; planName: string;
    count: number; oldest: DueRow; total: number;
  };
  const byMember = new Map<string, DueRow[]>();
  for (const d of outstandingAll) {
    const list = byMember.get(d.member_id);
    if (list) list.push(d);
    else byMember.set(d.member_id, [d]);
  }
  const debtors: Debtor[] = [...byMember.entries()].map(([memberId, rows]) => {
    const oldest = rows.reduce((a, b) => (a.period <= b.period ? a : b));
    // The tier the DEBT was issued under, not the one the rider is on today:
    // this column sits next to "fatura më e vjetër" and describes it.
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
  for (const d of outstandingAll) {
    const bucket = agingBucket(d);
    const amount = toEuros(d.amount_eur);
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
      return {
        label: AGING_BUCKET_LABEL[b],
        value: slot.amount,
        display: `${formatEur(slot.amount)} · ${invoiceCount(slot.count)}`,
      };
    }),
    {
      label: "Ende brenda afatit",
      value: notYetDue.amount,
      display: `${formatEur(notYetDue.amount)} · ${invoiceCount(notYetDue.count)}`,
    },
  ];

  // --------------------------------------------------------------- truncation
  const truncated: string[] = [];
  if (rawWindow.length >= DUES_CAP) truncated.push("faturat e 12 muajve të fundit");
  if (rawCash.length >= DUES_CAP) truncated.push("pagesat e 12 muajve të fundit");
  if (rawOpen.length >= OPEN_CAP) truncated.push("faturat e hapura");
  if (memberships.length >= MEMBERSHIP_CAP) truncated.push("anëtarësitë");
  if (profiles.length >= PROFILE_CAP) truncated.push("emrat e anëtarëve");

  const label = periodLabel(period);
  const isCurrent = period === thisMonth;
  const base = "/admin/finance/reports";
  const hrefFor = (p: string) => (p === periodParam(thisMonth) ? base : `${base}?p=${p}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Raportet financiare</h1>
          <div className="sub">
            Sa para hyjnë, sa faturohet, sa pritet të vijë çdo muaj dhe sa ka mbetur pa u arkëtuar.
            Të gjitha shumat llogariten vetëm mbi anëtarësitë me pagesë — garuesit nuk faturohen
            dhe nuk hyjnë as te të hyrat, as te borxhi, as te norma e arkëtimit.
            {" "}<Link href="/admin/finance">Faturat</Link>
            {" · "}<Link href="/admin/finance/plans">Planet</Link>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <Link className="chip" href={hrefFor(periodParam(shiftPeriod(period, -1)))}>
          ← {periodLabel(shiftPeriod(period, -1))}
        </Link>
        <span className="chip active">{label}</span>
        <Link className="chip" href={hrefFor(periodParam(shiftPeriod(period, 1)))}>
          {periodLabel(shiftPeriod(period, 1))} →
        </Link>
        {!isCurrent ? <Link className="chip" href={base}>Muaji aktual</Link> : null}
        <div className="spacer" />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          Trendi dhe rritja: {periodLabel(windowStart)} – {label}
        </span>
      </div>

      {truncated.length > 0 ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--err)", margin: "0 0 12px" }}>
          Kujdes: u lexuan vetëm rreshtat e parë për {truncated.join(", ")}. Totalet më poshtë janë
          të paplota derisa raporti të ndahet në pjesë më të vogla.
        </div>
      ) : null}

      {/* 1 — TË HYRAT ------------------------------------------------------ */}
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h3>Të hyrat · {label}</h3>
        <span className="kicker">para në arkë kundrejt faturimit</span>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi
          accent="#101828"
          label="Para në arkë"
          value={formatEur(month.cash)}
          sub={month.cashCount === 0
            ? `asnjë pagesë e regjistruar në ${label}`
            : `${paymentCount(month.cashCount)} të regjistruara në ${label}`}
        />
        <Kpi
          accent="#2E90FA"
          label="Faturuar për muajin"
          value={formatEur(month.billed)}
          sub={month.billedCount === 0
            ? `asnjë faturë e lëshuar për ${label}`
            : `${invoiceCount(month.billedCount)} të lëshuara për ${label}`}
        />
        <Kpi
          accent="#E0562D"
          label="Pa arkëtuar nga muaji"
          value={formatEur(month.outstanding)}
          sub={month.outstandingCount === 0
            ? "asnjë faturë e hapur nga ky muaj"
            : `${invoiceCount(month.outstandingCount)} të hapura nga ky muaj`}
        />
        <Kpi
          accent="#16A34A"
          label="Norma e arkëtimit"
          value={rateLabel(monthRate)}
          sub={monthRate == null
            ? `nuk është faturuar asgjë për ${label}`
            : `${formatEur(month.collected)} nga ${formatEur(month.billed)} të faturuara`}
        />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h3>Muaji dhe viti deri tani</h3>
          <span className="kicker">dy pyetje të ndryshme, dy kolona</span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Periudha</th>
                <th className="num">Para në arkë</th>
                <th className="num">Faturuar</th>
                <th className="num">Arkëtuar nga ajo periudhë</th>
                <th className="num">Pa arkëtuar</th>
                <th className="num">Norma</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>{label}</td>
                <td className="num" data-lab="Para në arkë">{formatEur(month.cash)}</td>
                <td className="num" data-lab="Faturuar">{formatEur(month.billed)}</td>
                <td className="num" data-lab="Arkëtuar nga ajo periudhë">{formatEur(month.collected)}</td>
                <td className="num" data-lab="Pa arkëtuar" style={{ color: month.outstanding > 0 ? "var(--err)" : undefined }}>
                  {formatEur(month.outstanding)}
                </td>
                <td className="num" data-lab="Norma">{rateLabel(monthRate)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>{ytdLabel}</td>
                <td className="num" data-lab="Para në arkë">{formatEur(ytd.cash)}</td>
                <td className="num" data-lab="Faturuar">{formatEur(ytd.billed)}</td>
                <td className="num" data-lab="Arkëtuar nga ajo periudhë">{formatEur(ytd.collected)}</td>
                <td className="num" data-lab="Pa arkëtuar" style={{ color: ytd.outstanding > 0 ? "var(--err)" : undefined }}>
                  {formatEur(ytd.outstanding)}
                </td>
                <td className="num" data-lab="Norma">{rateLabel(ytdRate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-3)", maxWidth: "84ch" }}>
          <strong>Para në arkë</strong> është shuma e pagesave të regjistruara brenda periudhës, pa
          dallim se cilin muaj paguajnë — kështu një faturë e majit e paguar në gusht numërohet te
          gushti. <strong>Faturuar</strong> është shuma e faturave të lëshuara për vetë atë periudhë,
          dhe <strong>arkëtuar</strong> është pjesa e atyre faturave që është paguar. Norma e
          arkëtimit del nga këto dy të fundit, prandaj ajo nuk ndryshon kur dikush paguan një muaj
          të vjetër.
        </p>
        {ytd.waivedCount > 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
            {invoiceCount(ytd.waivedCount)} të falura ({formatEur(ytd.waived)}) gjatë vitit nuk numërohen
            as si të faturuara, as si të arkëtuara, as si borxh.
          </p>
        ) : null}
        {undatedPaid.length > 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
            {invoiceCount(undatedPaid.length)} të shënuara si të paguara nuk kanë datë pagese;
            janë llogaritur te muaji që faturojnë.
          </p>
        ) : null}
      </div>

      {/* 2 — TË HYRAT E PRITSHME MUJORE ------------------------------------ */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Të hyrat e pritshme mujore</h3>
          <span className="kicker">sipas anëtarësive në fuqi për {periodLabel(thisMonth)}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline" }}>
          <div>
            <div className="kicker">Shuma që duhet faturuar çdo muaj</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 34, letterSpacing: "-0.02em", marginTop: 6 }}>
              {formatEur(expectedMonthly)}
            </div>
          </div>
          <div>
            <div className="kicker">Anëtarë që paguajnë</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, marginTop: 6 }}>
              {memberCount(payingNow.length)}
            </div>
          </div>
          <div>
            <div className="kicker">Mesatarja për anëtar që paguan</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, marginTop: 6 }}>
              {averagePaying == null ? "Pa anëtarë me pagesë" : `${formatEur(averagePaying)} / muaj`}
            </div>
          </div>
          <div>
            <div className="kicker">Në vit, po të mbetet i njëjti numër</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, marginTop: 6 }}>
              {formatEur(expectedMonthly * 12)}
            </div>
          </div>
        </div>
        <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--text-3)", maxWidth: "84ch" }}>
          {payingNow.length === 0
            ? "Asnjë anëtarësi me pagesë nuk është në fuqi këtë muaj, prandaj nuk pritet asnjë euro nga anëtarësitë. Regjistro anëtarë në një plan me pagesë që kjo shifër të ketë kuptim."
            : <>Kjo është shuma e anëtarësive aktive me pagesë — pra çfarë duhet të lëshojë akademia si fatura çdo muaj nga tani e tutje, pavarësisht nëse faturat e këtij muaji janë gjeneruar apo jo. Llogaritet me të njëjtat rregulla që përdor gjeneruesi i faturave.</>}
          {waivedNow.length > 0
            ? <> Përveç tyre, {memberCount(waivedNow.length)} janë në një plan me pagesë por me shumë 0 (të falur) dhe nuk sjellin të hyra.</>
            : null}
          {racersNow.length > 0
            ? <> {memberCount(racersNow.length)} janë garues: jashtë faturimit fare, prandaj nuk numërohen këtu.</>
            : null}
        </p>
      </div>

      {/* 3 — TRENDI -------------------------------------------------------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Trendi i 12 muajve</h3>
          <span className="kicker">{periodLabel(windowStart)} – {label}</span>
        </div>
        {hasTrendData ? (
          <>
            <BilledVsCollected data={trend} />
            <p style={{ margin: "12px 0 6px", fontSize: 12.5, color: "var(--text-3)", maxWidth: "84ch" }}>
              {rate12 == null
                ? <>Gjatë 12 muajve nuk është faturuar asgjë, prandaj nuk ka normë arkëtimi për këtë periudhë. </>
                : <>Gjatë 12 muajve u faturuan {formatEur(billed12)}, prej të cilave janë paguar{" "}
                    {formatEur(collected12)} — normë arkëtimi {rate12}%. </>}
              Në arkë hynë {formatEur(cash12)}, shumë që përfshin edhe pagesa për muaj më të vjetër.
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Muaji</th>
                    <th className="num">Faturuar</th>
                    <th className="num">Arkëtuar nga ai muaj</th>
                    <th className="num">Para në arkë atë muaj</th>
                    <th className="num">Norma</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => {
                    const s = monthly.get(p) ?? emptyMonth();
                    const r = collectionRate(s.collected, s.billed);
                    return (
                      <tr key={p}>
                        <td style={{ fontWeight: p === period ? 600 : 400 }}>{periodLabel(p)}</td>
                        <td className="num" data-lab="Faturuar">{formatEur(s.billed)}</td>
                        <td className="num" data-lab="Arkëtuar nga ai muaj">{formatEur(s.collected)}</td>
                        <td className="num" data-lab="Para në arkë atë muaj">{formatEur(s.cash)}</td>
                        <td className="num" data-lab="Norma">{r == null ? "—" : `${r}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
            Në këta 12 muaj nuk është faturuar dhe nuk është arkëtuar asgjë. Trendi shfaqet sapo
            të gjenerohen faturat e para.
          </p>
        )}
      </div>

      {/* 4 — SIPAS PLANIT -------------------------------------------------- */}
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h3>Sipas planit</h3>
        {/* The windows differ on purpose: revenue is a 12-month view, the
            expected column is today's memberships, but a debt is a debt no
            matter how old, so the unpaid column is never truncated. */}
        <span className="kicker">
          anëtarë dhe të pritshme: sot · faturuar dhe arkëtuar: 12 muaj · pa arkëtuar: të gjitha kohërat
        </span>
      </div>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Plani</th>
              <th>Anëtarë në fuqi</th>
              <th>Çmimi</th>
              <th className="num">Të pritshme / muaj</th>
              <th className="num">Faturuar (12 muaj)</th>
              <th className="num">Arkëtuar (12 muaj)</th>
              <th className="num">Pa arkëtuar</th>
            </tr>
          </thead>
          <tbody>
            {planRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Ende nuk është krijuar asnjë plan anëtarësie.
                </td>
              </tr>
            ) : (
              planRows.map(({ plan, head, totals, showMoney }) => (
                <tr key={plan.id}>
                  <td style={{ fontWeight: 600 }}>{plan.name_sq}</td>
                  {/* On a PAYING tier the two numbers can differ: a rider set
                      to €0 (të falur) is on the tier but brings nothing, and
                      "Të pritshme / muaj" is built only from the ones who pay.
                      Saying so here is what keeps that column readable. */}
                  <td className="mono" data-lab="Anëtarë në fuqi">
                    {memberCount(head.members)}
                    {plan.billable && head.paying !== head.members
                      ? ` · ${head.paying} me pagesë`
                      : ""}
                  </td>
                  <td className="mono" data-lab="Çmimi">{planAmountLabel(plan)}</td>
                  {showMoney ? (
                    <>
                      <td className="num" data-lab="Të pritshme / muaj">{formatEur(head.expected)}</td>
                      <td className="num" data-lab="Faturuar (12 muaj)">{formatEur(totals.billed)}</td>
                      <td className="num" data-lab="Arkëtuar (12 muaj)">{formatEur(totals.collected)}</td>
                      <td
                        className="num"
                        data-lab="Pa arkëtuar"
                        style={{ fontWeight: totals.outstanding > 0 ? 600 : 400, color: totals.outstanding > 0 ? "var(--err)" : undefined }}
                      >
                        {formatEur(totals.outstanding)}
                      </td>
                    </>
                  ) : (
                    <td className="num" colSpan={4} data-lab="Faturimi" style={{ color: "var(--text-3)", textAlign: "left" }}>
                      Pa pagesë · {memberCount(head.members)} nuk faturohen
                    </td>
                  )}
                </tr>
              ))
            )}
            {hasOrphan && orphan ? (
              <tr>
                <td style={{ fontWeight: 600 }}>Pa plan</td>
                <td className="mono" data-lab="Anëtarë në fuqi">0 anëtarë</td>
                <td className="mono" data-lab="Çmimi" style={{ color: "var(--text-3)" }}>Fatura pa anëtarësi</td>
                <td className="num" data-lab="Të pritshme / muaj">{formatEur(0)}</td>
                <td className="num" data-lab="Faturuar (12 muaj)">{formatEur(orphan.billed)}</td>
                <td className="num" data-lab="Arkëtuar (12 muaj)">{formatEur(orphan.collected)}</td>
                <td className="num" data-lab="Pa arkëtuar">{formatEur(orphan.outstanding)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 5 — RRITJA -------------------------------------------------------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Rritja e anëtarësisë</h3>
          <span className="kicker">12 muajt e fundit</span>
        </div>
        {hasGrowthData ? (
          <>
            <MembershipFlow data={growth} />
            <p style={{ margin: "12px 0 6px", fontSize: 12.5, color: "var(--text-3)", maxWidth: "84ch" }}>
              Gjatë 12 muajve u hapën {joined12} anëtarësi të reja dhe
              u mbyllën {left12}; {changed12} të tjera ishin vetëm ndryshim plani te i njëjti anëtar
              dhe nuk numërohen as si ardhje, as si largim. Anëtarët me pagesë shkuan nga{" "}
              {payingAt.get(shiftPeriod(windowStart, -1)) ?? 0} në {payingAt.get(period) ?? 0}
              {" "}({net12 >= 0 ? `+${net12}` : net12}).
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Muaji</th>
                    <th className="num">Anëtarësi të reja</th>
                    <th className="num">Të mbyllura</th>
                    <th className="num">Ndryshim plani</th>
                    <th className="num">Anëtarë me pagesë</th>
                    {/* Explicitly "me pagesë": the two columns to the left count
                        EVERY membership row, garuesit included, while the net is
                        the change in the paying headcount. Two racers enrolling
                        is "+2 të reja" and a net of 0, and that has to read as
                        intended rather than as an arithmetic mistake. */}
                    <th className="num">Neto (me pagesë)</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.map((g, i) => (
                    <tr key={periods[i]}>
                      <td style={{ fontWeight: periods[i] === period ? 600 : 400 }}>{g.full}</td>
                      <td className="num" data-lab="Anëtarësi të reja">{g.joined}</td>
                      <td className="num" data-lab="Të mbyllura">{g.left}</td>
                      <td className="num" data-lab="Ndryshim plani">{g.changed}</td>
                      <td className="num" data-lab="Anëtarë me pagesë">{g.paying}</td>
                      <td
                        className="num"
                        data-lab="Neto (me pagesë)"
                        style={{ color: g.net > 0 ? "var(--ok, #16A34A)" : g.net < 0 ? "var(--err)" : undefined, fontWeight: g.net !== 0 ? 600 : 400 }}
                      >
                        {g.net > 0 ? `+${g.net}` : g.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
            Në 12 muajt e fundit nuk është hapur dhe nuk është mbyllur asnjë anëtarësi. Aktualisht
            janë {memberCount(payingNow.length)} me pagesë.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
        {/* 6 — MËNYRAT E PAGESËS ------------------------------------------- */}
        <div className="card">
          <div className="card-head">
            <h3>Mënyrat e pagesës</h3>
            <span className="kicker">para në arkë · {label}</span>
          </div>
          {month.cash > 0 ? (
            <>
              <RowBars data={methodBars} color="#0E9384" />
              <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
                Gjithsej {formatEur(month.cash)} nga {paymentCount(month.cashCount)} në {label}.
                Në 12 muajt e fundit: {METHOD_ORDER.map((m) => `${PAID_METHOD_LABEL[m].toLowerCase()} ${formatEur(windowMethods.get(m)?.amount ?? 0)}`).join(", ")}.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
              Në {label} nuk është regjistruar asnjë pagesë, prandaj nuk ka çfarë të ndahet sipas
              mënyrës. {cash12 > 0
                ? `Në 12 muajt e fundit kanë hyrë ${formatEur(cash12)}.`
                : "Në 12 muajt e fundit nuk ka hyrë asnjë euro."}
            </p>
          )}
        </div>

        {/* 7a — VJETËRSIA E BORXHIT ---------------------------------------- */}
        <div className="card">
          <div className="card-head">
            <h3>Vjetërsia e borxhit</h3>
            <span className="kicker">ditë pas afatit · të gjitha kohërat</span>
          </div>
          {outstandingAll.length === 0 ? (
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
      </div>

      {/* 7b — DEBITORËT ---------------------------------------------------- */}
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi
          accent="#DC2626"
          label="Borxhi gjithsej"
          value={formatEur(outstandingTotalEur)}
          sub={outstandingAll.length === 0
            ? "asnjë faturë e hapur"
            : `${invoiceCount(outstandingAll.length)} të hapura, të gjitha kohërat`}
        />
        <Kpi
          accent="#CA8A04"
          label="Mbi 60 ditë vonesë"
          value={formatEur(over60)}
          sub={outstandingTotalEur > 0 ? `${over60Share}% e borxhit total` : "pa borxh të vjetër"}
        />
        <Kpi
          accent="#B42318"
          label="Anëtarë me borxh"
          value={String(debtors.length)}
          sub={debtors.length === 0
            ? "askush nuk ka faturë të hapur"
            : `mesatarisht ${formatEur(averageEur(outstandingTotalEur, debtors.length) ?? 0)} për anëtar`}
        />
        <Kpi
          accent="#2E90FA"
          label="Anëtarësi në fuqi"
          value={String(covering.length)}
          sub={`${payingNow.length} me pagesë · ${waivedNow.length} të falur · ${racersNow.length} garues`}
        />
      </div>

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
                <td colSpan={6} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
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

      {/* PËRMBLEDHJE ------------------------------------------------------- */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="kicker">Të pritshme çdo muaj</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, letterSpacing: "-0.02em", marginTop: 6 }}>
            {formatEur(expectedMonthly)}
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-3)", maxWidth: "56ch" }}>
          {expectedMonthly > 0
            ? <>Kaq duhet të lëshojë akademia si fatura çdo muaj nga {memberCount(payingNow.length)} me pagesë. </>
            : <>Asnjë anëtarësi me pagesë nuk është në fuqi, prandaj nuk pritet asnjë e hyrë mujore. </>}
          {outstandingTotalEur > 0
            ? <>Pa u arkëtuar kanë mbetur {formatEur(outstandingTotalEur)}, prej të cilave {formatEur(over60)} ({over60Share}%) janë mbi 60 ditë pas afatit dhe kërkojnë ndjekje. </>
            : <>Nuk ka asnjë euro të paarkëtuar — të gjitha faturat e lëshuara janë të mbyllura. </>}
          {racersNow.length > 0
            ? <>{memberCount(racersNow.length)} garues stërviten pa pagesë mujore dhe nuk hyjnë në asnjë shifër më sipër.</>
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
