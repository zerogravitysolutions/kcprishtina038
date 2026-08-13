import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { RowBars } from "../../training/charts";
import {
  AGING_BUCKETS, AGING_BUCKET_LABEL, agingBucket, amountTotalLabel, averageEur, daysOverdue,
  formatEur, outstandingTotal, owedToMembers, owedToMembersTotal, periodLabel, periodParam,
  sumEur, toEuros, type AgingBucket,
} from "@/lib/finance";
import type { MembershipStatus } from "@/lib/supabase/types";
import {
  dayCount, expenseCount, invoiceCount, memberCount, readOpenDues, readOwedExpenses,
  type OpenDueRow,
} from "./data";
import { Kpi, LoadError, TruncationWarning } from "./ui";

const MEMBERSHIP_CAP = 4000;
const PROFILE_CAP = 4000;
const NAME_CAP = 2000;

type MembershipRow = {
  id: string; member_id: string; plan_id: string;
  amount_eur: number; billable: boolean; status: MembershipStatus;
  start_date: string; end_date: string | null;
};

type PlanRow = { id: string; name_sq: string; billable: boolean };
type ProfileRow = { id: string; full_name: string; email: string };
type TeamMemberRow = { id: string; full_name: string };

function initials(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?";
}

export async function BorxhetView() {
  const supabase = await createClient();
  // Both directions of debt, side by side, each from the query shape that owns
  // it: open invoices through readOpenDues (the same read the Arka view uses,
  // so the two tabs cannot print different euros) and unreimbursed expenses
  // through readOwedExpenses (the same read /admin/finance/expenses uses, all
  // years, never derived from a windowed expense list).
  const [open, owed, membershipRes, planRes, profileRes, teamRes] = await Promise.all([
    readOpenDues(supabase),
    readOwedExpenses(supabase),
    supabase
      .from("memberships")
      .select("id, member_id, plan_id, amount_eur, billable, status, start_date, end_date")
      .order("start_date", { ascending: true })
      .limit(MEMBERSHIP_CAP),
    supabase.from("membership_plans").select("id, name_sq, billable").order("display_order", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email").limit(PROFILE_CAP),
    supabase.from("team_members").select("id, full_name").limit(NAME_CAP),
  ]);

  // A debt that silently reads zero is worse than no page at all — "nobody owes
  // anything" would be a lie told with a green badge.
  const loadError =
    open.error ?? owed.error ?? membershipRes.error ?? planRes.error ?? profileRes.error ?? teamRes.error;
  if (loadError) return <LoadError message={dbError(loadError, "Leximi i borxheve dështoi.")} />;

  const memberships = (membershipRes.data as unknown as MembershipRow[] | null) ?? [];
  const plans = (planRes.data as unknown as PlanRow[] | null) ?? [];
  const profiles = (profileRes.data as unknown as ProfileRow[] | null) ?? [];
  const teamMembers = (teamRes.data as unknown as TeamMemberRow[] | null) ?? [];

  const planById = new Map(plans.map((p) => [p.id, p]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const teamMemberName = new Map(teamMembers.map((m) => [m.id, m.full_name]));

  const historyByMember = new Map<string, MembershipRow[]>();
  for (const m of memberships) {
    const list = historyByMember.get(m.member_id);
    if (list) list.push(m);
    else historyByMember.set(m.member_id, [m]);
  }
  for (const list of historyByMember.values()) {
    list.sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
  }

  // The tier the DEBT was issued under, not the one the rider is on today: the
  // plan column sits next to "fatura më e vjetër" and describes it.
  function planOf(due: OpenDueRow): PlanRow | null {
    const own = due.membership_id ? membershipById.get(due.membership_id) : null;
    const m = own ?? (historyByMember.get(due.member_id) ?? []).find(
      (r) => r.start_date <= due.period && (!r.end_date || r.end_date >= due.period),
    );
    return m ? planById.get(m.plan_id) ?? null : null;
  }

  // ---- what members owe the club -------------------------------------------
  // The headline is computed over EVERY open row, exactly as the Arka view's
  // "Për t’u arkëtuar nga anëtarët" card computes it — one helper, one figure.
  const debtTotal = outstandingTotal(open.rows);
  // The rows shown below drop one kind of noise only: a €0 invoice sitting on a
  // non-billable (racer) membership, which would list a rider who owes nothing
  // as a debtor. Those rows carry no money, so dropping them cannot move the
  // total above — the bars and the table still add up to it.
  const outstandingRows = open.rows.filter((d) => {
    const own = d.membership_id ? membershipById.get(d.membership_id) : null;
    return own && !own.billable ? toEuros(d.amount_eur) > 0 : true;
  });

  type Debtor = {
    memberId: string; name: string; email: string; planName: string;
    count: number; oldest: OpenDueRow; total: number;
  };
  const byMember = new Map<string, OpenDueRow[]>();
  for (const d of outstandingRows) {
    const list = byMember.get(d.member_id);
    if (list) list.push(d);
    else byMember.set(d.member_id, [d]);
  }
  const debtors: Debtor[] = [...byMember.entries()].map(([memberId, rows]) => {
    const oldest = rows.reduce((a, b) => (a.period <= b.period ? a : b));
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

  // ---- aging ----------------------------------------------------------------
  const aging = new Map<AgingBucket, { count: number; amount: number }>(
    AGING_BUCKETS.map((b) => [b, { count: 0, amount: 0 }]),
  );
  let notYetDue = { count: 0, amount: 0 };
  for (const d of outstandingRows) {
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
  const over60Share = debtTotal > 0 ? Math.round((over60 / debtTotal) * 100) : 0;
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

  // ---- what the club owes people --------------------------------------------
  const clubDebts = owedToMembers(owed.rows);
  const clubDebtTotal = owedToMembersTotal(owed.rows);

  const truncated: string[] = [];
  if (open.truncated) truncated.push("faturat e hapura");
  if (owed.truncated) truncated.push("shpenzimet e pa rimbursuara");
  if (memberships.length >= MEMBERSHIP_CAP) truncated.push("anëtarësitë");
  if (profiles.length >= PROFILE_CAP) truncated.push("emrat e anëtarëve");

  return (
    <>
      <TruncationWarning parts={truncated} />

      {/* ---------------------------------------------- members → club */}
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi
          accent="#DC2626"
          label="Borxhi gjithsej"
          value={formatEur(debtTotal)}
          sub={outstandingRows.length === 0
            ? "asnjë faturë e hapur"
            : `${invoiceCount(outstandingRows.length)} të hapura, të gjitha kohërat`}
        />
        <Kpi
          accent="#CA8A04"
          label="Mbi 60 ditë vonesë"
          value={formatEur(over60)}
          sub={debtTotal > 0 ? `${over60Share}% e borxhit total` : "pa borxh të vjetër"}
        />
        <Kpi
          accent="#B42318"
          label="Anëtarë me borxh"
          value={String(debtors.length)}
          sub={debtors.length === 0
            ? "askush nuk ka faturë të hapur"
            : `mesatarisht ${formatEur(averageEur(debtTotal, debtors.length) ?? 0)} për anëtar`}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Vjetërsia e borxhit</h3>
          <span className="kicker">ditë pas afatit · të gjitha kohërat</span>
        </div>
        {outstandingRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>
            Nuk ka asnjë borxh të hapur. Çdo faturë e lëshuar është paguar ose falur.
          </p>
        ) : (
          <>
            <RowBars data={agingBars} color="#DC2626" />
            <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>
              Borxhi gjithsej {formatEur(debtTotal)}, prej të cilit {formatEur(over60)} është
              mbi 60 ditë pas afatit ({over60Share}%).
            </p>
          </>
        )}
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

      {/* ---------------------------------------------- club → people */}
      <div className="card">
        <div className="card-head">
          <h3>Kujt i ka borxh klubi</h3>
          <span className="kicker">të gjitha vitet</span>
        </div>
        {clubDebts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
            Askush nuk pret para nga klubi. Kur dikush paguan një shpenzim nga xhepi i vet dhe ende s’i është
            kthyer, shfaqet këtu me shumën e saktë.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Personi</th>
                    <th>Shpenzime</th>
                    <th>Shuma</th>
                  </tr>
                </thead>
                <tbody>
                  {clubDebts.map((d) => (
                    <tr key={d.memberId}>
                      <td>{teamMemberName.get(d.memberId) ?? "Person i panjohur"}</td>
                      <td className="mono" data-lab="Shpenzime">
                        <span>
                          {expenseCount(d.count)}
                          {d.missing > 0 ? (
                            <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                              {d.missing} pa shumë të shënuar
                            </small>
                          ) : null}
                        </span>
                      </td>
                      <td className="num" data-lab="Shuma">{formatEur(d.total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 600 }}>Gjithsej</td>
                    <td className="mono" data-lab="Shpenzime">{expenseCount(clubDebtTotal.counted + clubDebtTotal.missing)}</td>
                    <td className="num" data-lab="Shuma" style={{ fontWeight: 600 }}>{amountTotalLabel(clubDebtTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
              Shlyerja bëhet te <Link href="/admin/finance/expenses?owed=1">Shpenzimet</Link>: hape shpenzimin
              dhe shtyp “Shëno si të rimbursuar” me shënimin se si u shlye.
            </p>
          </>
        )}
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 14, lineHeight: 1.7 }}>
        Të dyja kahet e borxhit rrinë bashkë sepse asnjëra nuk është në arkë: {memberCount(debtors.length)} u
        kanë mbetur borxh klubit {formatEur(debtTotal)}, dhe klubi u ka borxh personave {amountTotalLabel(clubDebtTotal)}.
        Asnjëra shifër nuk filtrohet sipas vitit — një faturë e hapur nga maji është borxh edhe në gusht.
      </p>
    </>
  );
}
