import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { RowBars, type Point } from "../../training/charts";
import {
  UNKNOWN_CATEGORY_LABEL, UNKNOWN_SPONSOR_LABEL, amountTotalLabel, amountTotalValue, clubBalance,
  formatEur, isOwedToMember, membershipIncome, outstandingTotal, owedToMembers, owedToMembersTotal,
  sponsorPositions, sumAmounts, sumEur, type ExpenseLike, type FundLike,
} from "@/lib/finance";
import type {
  ClubFundKind, ClubFundStatus, ExpensePaidBy, ExpenseStatus,
} from "@/lib/supabase/types";
import {
  PAID_DUES_CAP, expenseCount, fundCount, invoiceCount, overviewHref, paidDuesInYear, paymentCount,
  personCount, readOpenDues, readOwedExpenses, readPaidDues, undatedPaidNote, undatedPaidRows,
  yearOfPayment,
} from "./data";
import {
  ALL, ALL_TIME_NOTE, ALL_YEARS_LABEL, currentYear, parseYearParam, yearChoices, yearWindowLabel,
} from "../filters";
import { AllTimeBalance, Kpi, LoadError, OutsideCard, TruncationWarning } from "./ui";

// Caps, as on the page this view replaces. Each one is surfaced when it bites.
const FUND_CAP = 2000;
const EXPENSE_CAP = 5000;
const NAME_CAP = 2000;

type FundRow = FundLike & {
  id: string; title: string; occurred_on: string;
  amount_eur: number; kind: ClubFundKind; status: ClubFundStatus; sponsor_id: string | null;
};

type ExpenseRow = ExpenseLike & {
  id: string; occurred_on: string; category_id: string; description: string;
  amount_eur: number | null; status: ExpenseStatus; paid_by: ExpensePaidBy;
  paid_by_member_id: string | null; funding_sponsor_id: string | null; reimbursed: boolean;
};

type CategoryRow = { id: string; name_sq: string; display_order: number };
type SponsorRow = { id: string; name: string };

/** The calendar year a "YYYY-MM-DD" column falls in. */
function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** `p` is not read here — it is carried so the other tab keeps its month. */
export async function ArkaView({ y, p }: { y?: string; p?: string }) {
  const supabase = await createClient();
  // Six flat selects, then every grouping in memory. Two of them are NOT
  // windowed on purpose (see below): debt is debt no matter how old. Only this
  // view's reads run — the other two views never touch these tables.
  const [paid, open, fundRes, expenseRes, categoryRes, sponsorRes, owed] = await Promise.all([
    // The same read /admin/finance/funds uses for academy cash-in, so the two
    // screens print the same euros for the same window.
    readPaidDues(supabase),
    readOpenDues(supabase),
    supabase
      .from("club_funds")
      .select("id, title, occurred_on, amount_eur, kind, status, sponsor_id")
      .order("occurred_on", { ascending: false })
      .limit(FUND_CAP),
    supabase
      .from("club_expenses")
      .select(
        "id, occurred_on, category_id, description, amount_eur, status, paid_by, " +
        "paid_by_member_id, funding_sponsor_id, reimbursed",
      )
      .order("occurred_on", { ascending: false })
      .limit(EXPENSE_CAP),
    supabase.from("expense_categories").select("id, name_sq, display_order").order("display_order"),
    supabase.from("sponsors").select("id, name").limit(NAME_CAP),
    readOwedExpenses(supabase),
  ]);

  // Every figure here is a total, and a total that silently reads zero is worse
  // than no page at all — "the club owes nobody" would be a lie told in green.
  const loadError =
    paid.error ?? open.error ?? fundRes.error ?? expenseRes.error
    ?? categoryRes.error ?? sponsorRes.error ?? owed.error;
  if (loadError) return <LoadError message={dbError(loadError, "Leximi i të dhënave financiare dështoi.")} />;

  const paidDues = paid.rows;
  const openDues = open.rows;
  const funds = (fundRes.data as unknown as FundRow[] | null) ?? [];
  const expenses = (expenseRes.data as unknown as ExpenseRow[] | null) ?? [];
  const categories = (categoryRes.data as unknown as CategoryRow[] | null) ?? [];
  const sponsorRows = (sponsorRes.data as unknown as SponsorRow[] | null) ?? [];

  const categoryName = new Map(categories.map((c) => [c.id, c.name_sq]));
  const sponsorName = new Map(sponsorRows.map((s) => [s.id, s.name]));

  // ---- the window ----------------------------------------------------------
  // The default is THIS year, everywhere in the panel; "të gjitha vitet" is a
  // choice you make, never the state you land in.
  const year = parseYearParam(y);
  const years = yearChoices([
    ...funds.map((f) => yearOf(f.occurred_on)),
    ...expenses.map((e) => yearOf(e.occurred_on)),
    ...paidDues.map((d) => yearOfPayment(d.paid_at)).filter((v): v is string => !!v),
  ], year);
  const yearLabel = yearWindowLabel(year);

  const windowFunds = funds.filter((f) => year === ALL || yearOf(f.occurred_on) === year);
  const windowExpenses = expenses.filter((e) => year === ALL || yearOf(e.occurred_on) === year);
  const windowPaidDues = paidDuesInYear(paidDues, year);
  // Paid invoices with no payment date cannot be placed in a year. Under a year
  // filter they are left out, and the page says so rather than pretending. They
  // DO belong in the all-time total below — "since the club started" has no
  // bucket for them to fall out of — which is precisely why the years will not
  // add up to it, and why the euros they carry are totalled here.
  const undated = undatedPaidRows(paidDues);
  const undatedPaid = undated.length;
  const undatedIncome = membershipIncome(undated);

  // ---- the position --------------------------------------------------------
  // clubBalance does no date filtering: it totals exactly the rows handed to
  // it, so the headline can never disagree with the lists below.
  const balance = clubBalance({ dues: windowPaidDues, funds: windowFunds, expenses: windowExpenses });
  // The same helper over the SAME rows, unwindowed: the club since it started.
  // No second query and no second definition of what income is — the only
  // difference between this figure and the one above is which rows go in.
  const allTime = clubBalance({ dues: paidDues, funds, expenses });
  const paidExpenses = windowExpenses.filter((e) => e.status === "paid");
  const unpaidExpenses = windowExpenses.filter((e) => e.status === "unpaid");
  const receivedFunds = windowFunds.filter((f) => f.status === "received");
  // Pledges are a POSITION, not a flow of the selected year: money agreed in
  // 2025 and still not transferred is an open pledge in 2026 too. So they are
  // counted across every year — the card says so — and /admin/finance/funds
  // counts them the same way, which is why the two screens agree.
  const pledgedFunds = funds.filter((f) => f.status === "pledged");
  const pledgedTotal = sumEur(pledgedFunds);
  const missingAmountCount = balance.paidMissingAmount + balance.unpaidMissingAmount;
  // Costs inside "Daljet" that a PERSON fronted and has not been paid back for.
  // They are a real outflow for the club, but they have not left the club's
  // account yet — and the same euros appear again below as "Detyrime ndaj
  // personave". Whoever reads both figures has to be told not to subtract them
  // twice, or the club looks poorer than it is by exactly this amount.
  const frontedStillOwed = sumAmounts(paidExpenses.filter(isOwedToMember));

  // NOT windowed, on purpose. Both of these come from the shared helpers, which
  // is the whole point of the merge: the Borxhet view prints the very same two
  // figures off the very same reads, so the two tabs can never disagree.
  const memberDebt = outstandingTotal(openDues);
  const owedDebts = owedToMembers(owed.rows);
  const owedTotal = owedToMembersTotal(owed.rows);

  const sponsorStand = sponsorPositions(windowFunds, windowExpenses);
  // The per-sponsor table IS windowed (a budget is spent within a year), so an
  // open pledge dated in another year is invisible in it. Saying how many is
  // what keeps a needed transfer from hiding behind the year filter.
  const pledgesOutsideWindow = pledgedFunds.length - windowFunds.filter((f) => f.status === "pledged").length;

  // ---- breakdowns ----------------------------------------------------------
  // By year, over EVERYTHING — this is the section that puts the selected year
  // in context, so it deliberately ignores the filter and says so.
  const allYears = [...years].sort((a, b) => a.localeCompare(b));
  // `running` is the club's cumulative position after each year — the column
  // that walks the eye from the first year to the headline above, so the two
  // windows on this page are visibly the same money seen twice.
  let running = 0;
  const byYear = allYears.map((yr) => {
    const f = funds.filter((r) => yearOf(r.occurred_on) === yr);
    const e = expenses.filter((r) => yearOf(r.occurred_on) === yr);
    const d = paidDues.filter((r) => yearOfPayment(r.paid_at) === yr);
    const b = clubBalance({ dues: d, funds: f, expenses: e });
    running += b.balance;
    return {
      year: yr, income: b.income, spent: b.expensesPaid, balance: b.balance,
      missing: b.paidMissingAmount, running,
    };
  });

  // The reconciliation, as arithmetic rather than as a promise: the years add
  // up to `yearsTotal`, the undated payments are the known gap, and whatever is
  // still left over gets a row of its own instead of being rounded away.
  const yearsTotal = byYear.reduce(
    (acc, r) => ({
      income: acc.income + r.income, spent: acc.spent + r.spent,
      balance: acc.balance + r.balance, missing: acc.missing + r.missing,
    }),
    { income: 0, spent: 0, balance: 0, missing: 0 },
  );
  const residualIncome = allTime.income - yearsTotal.income - undatedIncome;
  const residualSpent = allTime.expensesPaid - yearsTotal.spent;
  // Half a cent: a rounding tail is not a missing row and must not print one.
  const hasResidual = Math.abs(residualIncome) >= 0.005 || Math.abs(residualSpent) >= 0.005;

  // By category, over the window. sumAmounts (never sumEur): an expense with no
  // agreed price is a real cost of unknown size, never a free one.
  const byCategory = [...new Set(windowExpenses.map((e) => e.category_id))]
    .map((id) => {
      const rows = windowExpenses.filter((e) => e.category_id === id);
      return { id, name: categoryName.get(id) ?? UNKNOWN_CATEGORY_LABEL, total: sumAmounts(rows), count: rows.length };
    })
    .sort((a, b) => b.total.total - a.total.total || b.count - a.count);

  const categoryPoints: Point[] = byCategory.map((c) => ({
    label: c.name,
    value: c.total.total,
    display: amountTotalLabel(c.total),
  }));

  const nothingYet = funds.length === 0 && expenses.length === 0 && paidDues.length === 0;
  // The three reads the BALANCE is made of, kept apart from the other two. A
  // one-year window almost never reaches a cap; a total over every year is
  // exactly where one starts to, and a total that was quietly cut short is not
  // a total — so the all-time card refuses to print a confident figure when any
  // of these bit, and says which.
  const balanceTruncated = [
    paidDues.length >= PAID_DUES_CAP ? "pagesat e anëtarësisë" : null,
    funds.length >= FUND_CAP ? "hyrjet" : null,
    expenses.length >= EXPENSE_CAP ? "shpenzimet" : null,
  ].filter(Boolean) as string[];
  const cut = balanceTruncated.length > 0;
  const truncated = [
    ...balanceTruncated,
    open.truncated ? "faturat e hapura" : null,
    owed.truncated ? "shpenzimet e pa rimbursuara" : null,
  ].filter(Boolean) as string[];

  // ---- the all-time card's own words ---------------------------------------
  // Never a bare figure: an amount that could not be counted stays words
  // ("Pa shumë"), and a figure a cap cut short is a floor ("së paku"), not a
  // total. A confident number is the one thing this card must not print when it
  // is not entitled to one.
  const allTimePaidExpenses = sumAmounts(expenses.filter((e) => e.status === "paid"));
  const allTimeSpentValue = amountTotalValue(allTimePaidExpenses);
  const allTimeNegative = !cut && allTime.balance < 0;
  const undatedSentence = undatedPaid === 1
    ? `Një pagesë e arkëtuar nuk ka datë pagese, prandaj nuk vendoset dot në asnjë vit — por hyn këtu, me ${formatEur(undatedIncome)}.`
    : `${undatedPaid} pagesa të arkëtuara nuk kanë datë pagese, prandaj nuk vendosen dot në asnjë vit — por hyjnë këtu, me ${formatEur(undatedIncome)}.`;
  const allTimeMissingSentence = allTime.paidMissingAmount === 1
    ? "Një shpenzim i paguar nuk ka shumë të shënuar: nuk numërohet si zero, prandaj daljet reale janë më të mëdha dhe bilanci më i vogël se kjo shifër."
    : `${allTime.paidMissingAmount} shpenzime të paguara nuk kanë shumë të shënuar: nuk numërohen si zero, prandaj daljet reale janë më të mëdha dhe bilanci më i vogël se kjo shifër.`;

  // The current year is the default, so it is the one left out of the URL.
  const link = (v: string) => overviewHref("arka", { y: v === currentYear() ? undefined : v, p });
  /** A link into the expense ledger that keeps THIS view's year window. */
  const expensesHref = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    if (year !== currentYear()) q.set("y", year);
    const s = q.toString();
    return s ? `/admin/finance/expenses?${s}` : "/admin/finance/expenses";
  };
  // The detail of both figures lives on the Borxhet tab; the window comes along
  // so coming back lands on the same year.
  const borxhetHref = overviewHref("borxhet", { y: year === currentYear() ? undefined : year, p });

  return (
    <>
      {/* ------------------------------------------------ the club, all time */}
      {/* Above the chips on purpose: everything BELOW this line follows the
          year filter, this does not. It is the first thing the eye lands on
          because it is the question the owner opens the page with — what has
          the club taken in, spent, and got left since it started. */}
      {nothingYet ? null : (
        <AllTimeBalance
          window={`Që nga fillimi · ${ALL_TIME_NOTE}`}
          income={cut ? `së paku ${formatEur(allTime.income)}` : formatEur(allTime.income)}
          incomeSub={`anëtarësi ${formatEur(allTime.membershipIncome)} + fonde ${formatEur(allTime.fundsReceived)}`}
          spent={cut && allTimePaidExpenses.counted > 0 ? `së paku ${allTimeSpentValue}` : allTimeSpentValue}
          spentSub={
            `${expenseCount(allTimePaidExpenses.counted + allTimePaidExpenses.missing)} të paguara`
            + (allTime.paidMissingAmount > 0 ? ` · ${allTime.paidMissingAmount} pa shumë` : "")
          }
          balance={cut ? "I paplotë" : formatEur(allTime.balance)}
          balanceSub={
            cut
              ? "dy anët e tij janë prerë nga kufiri i leximit"
              : allTimeNegative
                ? `klubi ka dalë ${formatEur(-allTime.balance)} mbi hyrjet`
                : "hyrjet minus daljet, të gjitha vitet bashkë"
          }
          negative={allTimeNegative}
          note={
            <>
              Kjo kartë nuk e ndjek filtrin e vitit: mbledh çdo pagesë anëtarësie të arkëtuar, çdo hyrje të
              pranuar dhe çdo shpenzim të paguar që nga rreshti i parë i regjistruar. Bilanci poshtë i tregon
              të njëjtat para përmes dritares që zgjedh me çipat; kartat te “Jashtë bilancit” e kanë secila
              dritaren e vet të shënuar mbi to.{" "}
              {undatedPaid > 0
                ? `Vitet poshtë nuk mblidhen sa kjo shifër: ${undatedSentence} Diferenca mes tabelës “Sipas vitit” dhe kësaj karte është pikërisht aq.`
                : "Vitet poshtë mblidhen pikërisht sa kjo shifër — çdo pagesë e ka datën e vet dhe zë vend në një vit."}
              {allTime.paidMissingAmount > 0 ? ` ${allTimeMissingSentence}` : ""}
            </>
          }
          warning={
            cut
              ? `Kujdes: janë lexuar vetëm rreshtat e parë për ${balanceTruncated.join(", ")}. Hyrjet dhe daljet këtu mbulojnë vetëm një pjesë të historikut, prandaj bilanci total nuk shfaqet si shifër — do të ishte një numër i sigurt mbi të dhëna të cunguara.`
              : null
          }
        />
      )}

      {/* Newest year first, the catch-all last: the frame this page opens in is
          the current year, not the whole history. */}
      <div className="filter-bar">
        {years.map((v) => (
          <Link key={v} className={`chip ${year === v ? "active" : ""}`} href={link(v)}>{v}</Link>
        ))}
        <Link className={`chip ${year === ALL ? "active" : ""}`} href={link(ALL)}>{ALL_YEARS_LABEL}</Link>
        <div className="spacer" />
        <span className="meta">{yearLabel}</span>
      </div>

      <TruncationWarning parts={truncated} />

      {nothingYet ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
            Ende nuk ka asnjë lëvizje parash. Sapo të regjistrohet pagesa e parë e anëtarësisë, një sponsorizim
            te <Link href="/admin/finance/funds">Hyrjet e klubit</Link> ose një shpenzim te{" "}
            <Link href="/admin/finance/expenses">Shpenzimet</Link>, bilanci i klubit shfaqet këtu.
          </p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- balance */}
      {/* Titled, because the inked card above says "Bilanci total" and this trio
          says "Bilanci": whoever reads them has to see at once which window each
          one is in, without reading down to a sub-label. */}
      <div className="card-head" style={{ border: 0, padding: 0, marginBottom: 12 }}>
        <h3>{year === ALL ? "Bilanci i dritares së zgjedhur" : `Bilanci i vitit ${year}`}</h3>
        <span className="kicker">{yearLabel}</span>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 8 }}>
        <Kpi
          accent="#16A34A"
          label="Hyrjet"
          value={formatEur(balance.income)}
          sub={`anëtarësi ${formatEur(balance.membershipIncome)} + fonde ${formatEur(balance.fundsReceived)} · ${yearLabel}`}
        />
        <Kpi
          accent="#E0562D"
          label="Daljet"
          value={formatEur(balance.expensesPaid)}
          sub={
            `${expenseCount(paidExpenses.length)} të paguara · ${yearLabel}`
            + (balance.paidMissingAmount > 0 ? ` · ${balance.paidMissingAmount} pa shumë` : "")
          }
        />
        <Kpi
          accent={balance.balance < 0 ? "#B42318" : "#0E9384"}
          label="Bilanci"
          value={formatEur(balance.balance)}
          sub={
            (balance.balance < 0 ? `klubi ka dalë ${formatEur(-balance.balance)} mbi hyrjet` : "hyrjet minus daljet")
            + ` · ${yearLabel}`
          }
          tone={balance.balance < 0 ? "err" : undefined}
        />
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 18px", lineHeight: 1.8 }}>
        Hyrjet = {paymentCount(windowPaidDues.length)} anëtarësie të arkëtuara + {fundCount(receivedFunds.length)} të
        pranuara. Daljet = shpenzimet e shënuara si të paguara. Paratë e premtuara dhe faturat e papaguara nuk hyjnë
        në këtë bilanc — janë më poshtë.
        {balance.paidMissingAmount > 0
          ? ` ${balance.paidMissingAmount} shpenzime të paguara nuk kanë shumë të shënuar, prandaj daljet reale janë më të mëdha se kjo shifër.`
          : ""}
        {frontedStillOwed.total > 0 || frontedStillOwed.missing > 0
          ? ` Nga daljet, ${amountTotalLabel(frontedStillOwed)} i kanë paguar persona nga xhepi i tyre dhe ende s’u janë kthyer: këto para nuk kanë dalë nga llogaria e klubit, por dalin sërish më poshtë te “Detyrime ndaj personave” — mos i zbrit dy herë.`
          : ""}
        {year !== ALL && undatedPaid > 0
          ? ` ${undatedPaidNote(undatedPaid)}`
          : ""}
      </p>

      {/* ------------------------------------------------- outside the balance */}
      <div className="card-head" style={{ border: 0, padding: 0, marginBottom: 12 }}>
        <h3>Jashtë bilancit</h3>
        <span className="kicker">para që nuk janë në llogari</span>
      </div>

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <OutsideCard
          title="Premtuar por pa arritur"
          value={formatEur(pledgedTotal)}
          window={ALL_TIME_NOTE}
          tone={pledgedTotal > 0 ? "warn" : "neutral"}
          note={
            pledgedFunds.length === 0
              ? "Asnjë premtim i hapur, në asnjë vit."
              : `${fundCount(pledgedFunds.length)} të marra vesh me sponsorë ose donatorë, ende jashtë llogarisë. Nuk mund të shpenzohen. Një premtim i hapur nuk i takon një viti — prandaj kjo shifër nuk e ndjek filtrin lart.`
          }
          href="/admin/finance/funds"
          hrefLabel="Shiko hyrjet"
        />
        <OutsideCard
          title="Për t’u arkëtuar nga anëtarët"
          value={formatEur(memberDebt)}
          window={ALL_TIME_NOTE}
          tone={memberDebt > 0 ? "warn" : "neutral"}
          note={
            openDues.length === 0
              ? "Asnjë faturë e hapur — të gjitha kuotat janë paguar ose falur."
              : `${invoiceCount(openDues.length)} të hapura. Një faturë e hapur nga maji është borxh edhe sot, prandaj kjo shifër nuk e ndjek filtrin lart.`
          }
          href={borxhetHref}
          hrefLabel="Shiko borxhet"
        />
        <OutsideCard
          title="Detyrime ndaj personave"
          value={amountTotalLabel(owedTotal)}
          window={ALL_TIME_NOTE}
          tone={owedTotal.total > 0 || owedTotal.missing > 0 ? "err" : "neutral"}
          note={
            owedDebts.length === 0
              ? "Klubi nuk i ka borxh askujt — asnjë shpenzim i paguar nga xhepi i dikujt nuk ka mbetur pa u kthyer."
              : `${personCount(owedDebts.length)} kanë paguar nga xhepi i tyre dhe presin t’u kthehet. Një borxh i vitit 2024 është borxh edhe sot, prandaj kjo shifër nuk e ndjek filtrin lart.`
          }
          href={borxhetHref}
          hrefLabel="Shiko kujt"
        />
        <OutsideCard
          title="Shpenzime të papaguara"
          value={amountTotalValue(sumAmounts(unpaidExpenses))}
          window={yearLabel}
          tone={balance.expensesUnpaid > 0 ? "warn" : "neutral"}
          note={
            unpaidExpenses.length === 0
              ? "Asnjë shpenzim i pashlyer për këtë periudhë."
              : `${expenseCount(unpaidExpenses.length)} të shënuara si të papaguara${balance.unpaidMissingAmount > 0 ? `, nga to ${balance.unpaidMissingAmount} pa shumë` : ""}.`
          }
          href={expensesHref({ st: "unpaid" })}
          hrefLabel="Shiko shpenzimet"
        />
        <OutsideCard
          title="Shpenzime pa shumë"
          value={String(missingAmountCount)}
          window={yearLabel}
          tone={missingAmountCount > 0 ? "warn" : "neutral"}
          note={
            missingAmountCount === 0
              ? "Çdo shpenzim i kësaj periudhe ka një shumë të shënuar."
              : "Kosto reale me çmim të pacaktuar ende. Nuk janë zero — bilanci lart është aq më i vogël sa këto."
          }
          href={expensesHref({})}
          hrefLabel="Plotëso shumat"
        />
      </div>

      {/* ------------------------------------------------- sponsor positions */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h3>Sipas sponsorit</h3>
          <span className="kicker">{yearLabel}</span>
        </div>
        {sponsorStand.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
            Asnjë sponsor nuk ka as para të regjistruara, as shpenzime të ngarkuara për këtë periudhë.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-3)", lineHeight: 1.7 }}>
              “Shpenzuar” numëron çdo kosto të ngarkuar në buxhetin e sponsorit, të paguar apo jo — një shpenzim i
              ngarkuar është i zënë sido që të jetë. Kur mbetja del negative, klubi ka shpenzuar më shumë sesa ka
              marrë: aq nevojitet të transferohet. Kjo tabelë ndjek filtrin e vitit: {yearLabel}.
              {pledgesOutsideWindow > 0
                ? ` ${fundCount(pledgesOutsideWindow)} të premtuara janë shënuar në vite të tjera dhe nuk hyjnë këtu — hapi “${ALL_YEARS_LABEL.toLowerCase()}” për t’i parë të gjitha.`
                : ""}
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  {/* Money headers carry .num like their cells do: a header
                      styled apart from its column drifts the moment a figure
                      grows a digit or a cell wraps. */}
                  <tr>
                    <th>Sponsori</th>
                    <th className="num">Premtuar</th>
                    <th className="num">Pranuar</th>
                    <th className="num">Shpenzuar</th>
                    <th>Gjendja</th>
                  </tr>
                </thead>
                <tbody>
                  {sponsorStand.map((s) => (
                    <tr key={s.sponsorId}>
                      <td>
                        <span>
                          {sponsorName.get(s.sponsorId) ?? UNKNOWN_SPONSOR_LABEL}
                          <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                            {fundCount(s.fundCount)} · {expenseCount(s.expenseCount)}
                          </small>
                        </span>
                      </td>
                      <td className="num" data-lab="Premtuar">{formatEur(s.pledged)}</td>
                      <td className="num" data-lab="Pranuar">{formatEur(s.received)}</td>
                      <td className="num" data-lab="Shpenzuar">
                        <span>
                          {formatEur(s.spent)}
                          {s.missingAmount > 0 ? (
                            <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                              {s.missingAmount} pa shumë
                            </small>
                          ) : null}
                        </span>
                      </td>
                      <td data-lab="Gjendja">
                        {s.transferNeeded > 0 ? (
                          <span>
                            <span className="badge-st err">Nevojitet transferi</span>
                            <small style={{ display: "block", fontSize: 11, color: "var(--err)", marginTop: 4 }}>
                              {formatEur(s.transferNeeded)} · pas premtimeve {formatEur(s.projected)}
                            </small>
                          </span>
                        ) : (
                          <span>
                            <span className="badge-st ok">Mbetur {formatEur(s.remaining)}</span>
                            {s.pledged > 0 ? (
                              <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                                pas premtimeve {formatEur(s.projected)}
                              </small>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* --------------------------------------------------------- by year */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h3>Sipas vitit</h3>
          <span className="kicker">të gjitha vitet</span>
        </div>
        {byYear.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)" }}>
            Ende nuk ka asnjë vit me lëvizje parash.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-3)", lineHeight: 1.7 }}>
              Kjo tabelë nuk ndjek filtrin lart — e tregon çdo vit, që të krahasohen mes vete. Hyrjet e një viti
              janë pagesat e anëtarësisë të arkëtuara atë vit plus fondet e pranuara atë vit. Kolona “Kumulativ”
              e mbart bilancin nga një vit në tjetrin, ndaj rreshti i fundit i saj është pikërisht kartela e
              zezë lart — minus çka nuk vendoset dot në një vit.
              {undatedPaid > 0
                ? ` ${undatedPaidNote(undatedPaid)}`
                : ""}
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Viti</th>
                    <th className="num">Hyrjet</th>
                    <th className="num">Daljet</th>
                    <th className="num">Bilanci</th>
                    <th className="num">Kumulativ</th>
                  </tr>
                </thead>
                <tbody>
                  {byYear.map((row) => (
                    <tr key={row.year}>
                      <td className="mono">{row.year}</td>
                      <td className="num" data-lab="Hyrjet">{formatEur(row.income)}</td>
                      <td className="num" data-lab="Daljet">
                        <span>
                          {formatEur(row.spent)}
                          {row.missing > 0 ? (
                            <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                              {row.missing} pa shumë
                            </small>
                          ) : null}
                        </span>
                      </td>
                      <td className="num" data-lab="Bilanci" style={{ color: row.balance < 0 ? "var(--err)" : undefined }}>
                        {formatEur(row.balance)}
                      </td>
                      <td className="num" data-lab="Kumulativ" style={{ color: row.running < 0 ? "var(--err)" : undefined }}>
                        {formatEur(row.running)}
                      </td>
                    </tr>
                  ))}

                  {/* The reconciliation between the two windows on this page,
                      spelled out as addition: the years, then what has no year,
                      then the black card at the top. A reader who finds two
                      different totals under one word has to be able to see, on
                      the page, exactly which rows make up the difference. */}
                  <tr className="sum">
                    <td>Gjithsej vitet</td>
                    <td className="num" data-lab="Hyrjet">{formatEur(yearsTotal.income)}</td>
                    <td className="num" data-lab="Daljet">
                      <span>
                        {formatEur(yearsTotal.spent)}
                        {yearsTotal.missing > 0 ? (
                          <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                            {yearsTotal.missing} pa shumë
                          </small>
                        ) : null}
                      </span>
                    </td>
                    <td className="num" data-lab="Bilanci" style={{ color: yearsTotal.balance < 0 ? "var(--err)" : undefined }}>
                      {formatEur(yearsTotal.balance)}
                    </td>
                    <td className="num" data-lab="Kumulativ">—</td>
                  </tr>

                  {undatedPaid > 0 ? (
                    <tr className="sum">
                      <td>
                        Pa datë pagese
                        <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          {paymentCount(undatedPaid)} që nuk vendosen dot në një vit
                        </small>
                      </td>
                      <td className="num" data-lab="Hyrjet">{formatEur(undatedIncome)}</td>
                      <td className="num" data-lab="Daljet">{formatEur(0)}</td>
                      <td className="num" data-lab="Bilanci">{formatEur(undatedIncome)}</td>
                      <td className="num" data-lab="Kumulativ">—</td>
                    </tr>
                  ) : null}

                  {hasResidual ? (
                    <tr className="sum">
                      <td>
                        Jashtë viteve të listuara
                        <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                          rreshta me datë të palexueshme
                        </small>
                      </td>
                      <td className="num" data-lab="Hyrjet">{formatEur(residualIncome)}</td>
                      <td className="num" data-lab="Daljet">{formatEur(residualSpent)}</td>
                      <td className="num" data-lab="Bilanci">{formatEur(residualIncome - residualSpent)}</td>
                      <td className="num" data-lab="Kumulativ">—</td>
                    </tr>
                  ) : null}

                  <tr className="sum total">
                    <td>
                      Që nga fillimi
                      <small style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                        shifra e kartelës lart
                      </small>
                    </td>
                    {/* Cut short by a cap: the same refusal as the card, or the
                        row that quotes it would contradict it. */}
                    <td className="num" data-lab="Hyrjet">
                      {cut ? `së paku ${formatEur(allTime.income)}` : formatEur(allTime.income)}
                    </td>
                    {/* amountTotalValue, not formatEur: when NOT ONE paid
                        expense carries an amount the card prints "Pa shumë",
                        and a row that calls itself "shifra e kartelës lart"
                        must not answer "€0.00" to the same question. */}
                    <td className="num" data-lab="Daljet">
                      <span>
                        {cut && allTimePaidExpenses.counted > 0
                          ? `së paku ${allTimeSpentValue}`
                          : allTimeSpentValue}
                        {allTime.paidMissingAmount > 0 ? (
                          <small style={{ display: "block", fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
                            {allTime.paidMissingAmount} pa shumë
                          </small>
                        ) : null}
                      </span>
                    </td>
                    <td className="num" data-lab="Bilanci" style={{ color: !cut && allTime.balance < 0 ? "var(--err)" : undefined }}>
                      {cut ? "I paplotë" : formatEur(allTime.balance)}
                    </td>
                    <td className="num" data-lab="Kumulativ">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ----------------------------------------------------- by category */}
      <div className="card">
        <div className="card-head">
          <h3>Shpenzimet sipas kategorisë</h3>
          <span className="kicker">{yearLabel}</span>
        </div>
        {byCategory.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
            Nuk ka asnjë shpenzim të regjistruar për këtë periudhë.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-3)", lineHeight: 1.7 }}>
              Të paguara dhe të papaguara bashkë, {expenseCount(windowExpenses.length)} gjithsej. Rreshtat me
              “pa shumë” kanë kosto reale që ende nuk është çmuar.
            </p>
            <RowBars data={categoryPoints} />
          </>
        )}
      </div>
    </>
  );
}
