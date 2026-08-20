import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  UNKNOWN_CATEGORY_LABEL, UNKNOWN_MEMBER_LABEL, amountTotalLabel, amountTotalValue, formatEur,
  isOwedToMember, owedToMembers, owedToMembersTotal, sumAmounts,
} from "@/lib/finance";
import type { ExpensePaidBy, ExpensePaymentMethod, ExpenseStatus } from "@/lib/supabase/types";
import { NewExpenseButton, type ExpenseOptions, type ExpenseView } from "./ExpenseForm";
// Components and types only from the "use client" module; ALL is a VALUE and
// comes from the plain one, or the server would see a module proxy.
import { ExpenseFilters } from "./ExpenseFilters";
import {
  ALL, ALL_TIME_NOTE, defaultYear, isYear, parseYearParam, yearChoices, yearSpan, yearWindowLabel,
} from "../filters";
import { ExpenseRow } from "./ExpenseRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Shpenzimet e klubit" };

// club_expenses_select_staff / _write_staff (migration 20260810000002).
const FINANCE_ROLES = ["admin", "staff"];

// A year of a club's expenses is a few hundred rows. The cap only exists so a
// pathological year can never render forever; the UI says when it bites.
const ROW_CAP = 1500;

type ExpenseRowDb = {
  id: string;
  occurred_on: string;
  category_id: string;
  description: string;
  amount_eur: number | string | null;
  beneficiary_member_id: string | null;
  invoice_no: string | null;
  payment_method: ExpensePaymentMethod | null;
  paid_by: ExpensePaidBy;
  paid_by_member_id: string | null;
  funding_sponsor_id: string | null;
  status: ExpenseStatus;
  reimbursed: boolean;
  reimbursed_note: string | null;
  notes: string | null;
  receipt_paths: string[];
  created_at: string;
};

const SELECT =
  "id, occurred_on, category_id, description, amount_eur, beneficiary_member_id, invoice_no, " +
  "payment_method, paid_by, paid_by_member_id, funding_sponsor_id, status, reimbursed, " +
  "reimbursed_note, notes, receipt_paths, created_at";

type SearchParams = Promise<{
  y?: string; cat?: string; b?: string; st?: string; sp?: string; pb?: string; owed?: string;
  q?: string; rcpt?: string;
}>;

const STATUS_FILTERS = [
  { value: "all", label: "Të gjitha" },
  { value: "paid", label: "Paguar" },
  { value: "unpaid", label: "Papaguar" },
];

/** "1 shpenzim" / "3 shpenzime" — a bare count reads wrong in the singular. */
function expenseCount(n: number): string {
  return `${n} ${n === 1 ? "shpenzim" : "shpenzime"}`;
}

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");
  const canWrite = FINANCE_ROLES.includes(profile.role);
  const isAdmin = profile.role === "admin";

  const sp = await searchParams;
  const categoryFilter = (sp.cat ?? ALL).trim() || ALL;
  const beneficiaryFilter = (sp.b ?? ALL).trim() || ALL;
  const statusFilter = STATUS_FILTERS.some((s) => s.value === sp.st) ? sp.st! : ALL;
  const sponsorFilter = (sp.sp ?? ALL).trim() || ALL;
  // "all" | "club" | a team_members id — who actually handed over the money.
  const payerFilter = (sp.pb ?? ALL).trim() || ALL;
  const owedOnly = sp.owed === "1";
  // "Which costs have no proof?" — the question the owner asks when the
  // accountant wants the paperwork. Applied in JS with the rest of them.
  const noReceiptOnly = sp.rcpt === "0";
  const query = (sp.q ?? "").trim();

  const supabase = await createClient();

  // ---- the two ends of the ledger ------------------------------------------
  // Both are limit-1 walks of club_expenses_occurred_idx (occurred_on desc), so
  // each returns a single row off the head or the tail of an index and neither
  // touches the table at large. The pair gives this screen two things: the year
  // a bare URL resolves to (the newest one holding a shpenzim) and the span the
  // year picker covers. The oldest bound was already read here; the newest is
  // the one this costs.
  //
  // WHEN THEY RUN. This is the one screen that filters by year in SQL, so it
  // cannot build its main query until it knows the year — but only when the
  // year has to be RESOLVED. An explicit ?y=2024 or ?y=all is the answer
  // already, and then the bounds are needed for nothing but the picker, which
  // renders after the data anyway; in that case they join the main batch and
  // the page still costs a single wave. Only a bare URL pays for a phase of its
  // own, and it pays one round trip for two queries, not two.
  //
  // What was rejected: dropping the SQL year filter and windowing in memory
  // (the ROW_CAP that protects this page depends on the filter — an unwindowed
  // read would cut the newest 1500 rows out of every year at once and quietly
  // under-total the one on screen); a new SQL function returning both bounds in
  // one call (a migration to save ~20ms on an admin page); and guessing the
  // year from an unwindowed first page of rows, which cannot tell "the year
  // ended" from "the cap bit" without a second query anyway.
  const oldestQuery = supabase
    .from("club_expenses").select("occurred_on").order("occurred_on", { ascending: true }).limit(1);
  const newestQuery = supabase
    .from("club_expenses").select("occurred_on").order("occurred_on", { ascending: false }).limit(1);
  const yParam = (sp.y ?? "").trim();
  const chosenYear = yParam === ALL ? ALL : isYear(yParam) ? yParam : null;
  const bounds = chosenYear === null ? await Promise.all([oldestQuery, newestQuery]) : null;
  const boundOf = (res: { data: unknown } | null) =>
    (res?.data as { occurred_on: string }[] | null)?.[0]?.occurred_on;

  // Their sheets are per-year ("2024-2025", "2026"), so the year is the frame,
  // not a filter you have to remember to set: no ?y= means the newest year that
  // holds a shpenzim, which on 2 January is last year and not an empty page.
  // parseYearParam is still what reads the parameter — handed the bound this
  // page just resolved, or nothing at all when the parameter already decided.
  const year = chosenYear ?? parseYearParam(sp.y, [boundOf(bounds?.[1] ?? null)]);

  // ---- the reads -----------------------------------------------------------
  // The year window is applied in SQL; every other filter runs in JS over the
  // rows this page holds, so the totals printed above the list can never
  // disagree with the list itself.
  let expensesQuery = supabase
    .from("club_expenses")
    .select(SELECT)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);
  if (year !== ALL) {
    expensesQuery = expensesQuery.gte("occurred_on", `${year}-01-01`).lte("occurred_on", `${year}-12-31`);
  }

  const [
    expensesRes, categoriesRes, membersRes, sponsorsRes, owedRes, oldestRes, newestRes,
  ] = await Promise.all([
    expensesQuery,
    supabase
      .from("expense_categories")
      .select("id, name_sq, active, display_order")
      .order("display_order", { ascending: true }),
    supabase
      .from("team_members")
      .select("id, full_name, status")
      .order("full_name", { ascending: true })
      .limit(1000),
    supabase.from("sponsors").select("id, name, active").order("name", { ascending: true }).limit(200),
    // The club's debt to the people who fronted costs is NOT a per-year figure
    // — a bill Albioni paid in 2024 is still owed in 2026 — so it is read
    // across all years, straight off club_expenses_owed_idx.
    supabase
      .from("club_expenses")
      .select("id, occurred_on, description, amount_eur, status, paid_by, paid_by_member_id, reimbursed, funding_sponsor_id")
      .eq("paid_by", "member")
      .eq("reimbursed", false)
      .order("occurred_on", { ascending: false })
      .limit(500),
    // Already resolved above when the year had to be worked out; awaited here
    // (and so ISSUED here, in this one wave) when ?y= said which year it is.
    bounds ? bounds[0] : oldestQuery,
    bounds ? bounds[1] : newestQuery,
  ]);
  const oldest = boundOf(oldestRes);
  const newest = boundOf(newestRes);
  // The year a URL with no ?y= comes back to — the one year every link on this
  // page leaves out of the querystring.
  const defaultY = defaultYear([newest]);

  // owedRes is in here on purpose. It feeds the "Borxh ndaj anëtarëve" KPI and
  // the "Klubi u ka borxh" card, and if it fails silently both render €0.00 —
  // "the club owes nobody", a lie told in green. A liability that cannot be
  // read is not a liability of zero.
  const loadError =
    expensesRes.error ?? categoriesRes.error ?? membersRes.error ?? sponsorsRes.error ?? owedRes.error;
  if (loadError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Shpenzimet e klubit</h1>
            <div className="sub">Regjistri i shpenzimeve — çka del nga arka e klubit.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(loadError, "Leximi i shpenzimeve dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Nëse kjo përsëritet, ka gjasa që skema e shpenzimeve nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const raw = (expensesRes.data as unknown as ExpenseRowDb[] | null) ?? [];
  const categoryRows = (categoriesRes.data as unknown as
    { id: string; name_sq: string; active: boolean; display_order: number }[] | null) ?? [];
  const memberRows = (membersRes.data as unknown as
    { id: string; full_name: string; status: "active" | "past" }[] | null) ?? [];
  const sponsorRows = (sponsorsRes.data as unknown as
    { id: string; name: string; active: boolean }[] | null) ?? [];
  const owedRows = (owedRes.data as unknown as
    { id: string; occurred_on: string; description: string; amount_eur: number | string | null;
      status: ExpenseStatus; paid_by: ExpensePaidBy; paid_by_member_id: string | null;
      reimbursed: boolean; funding_sponsor_id: string | null }[] | null) ?? [];

  const options: ExpenseOptions = {
    categories: categoryRows.map((c) => ({ id: c.id, name_sq: c.name_sq, active: c.active })),
    members: memberRows.map((m) => ({ id: m.id, full_name: m.full_name, active: m.status === "active" })),
    sponsors: sponsorRows.map((s) => ({ id: s.id, name: s.name, active: s.active })),
  };
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name_sq]));
  const memberName = new Map(memberRows.map((m) => [m.id, m.full_name]));

  const expenses: ExpenseView[] = raw.map((e) => ({
    id: e.id,
    occurred_on: e.occurred_on,
    category_id: e.category_id,
    // A deleted category must not take the row down with it: the euros are
    // real, only the label is gone.
    category_name: categoryName.get(e.category_id) ?? UNKNOWN_CATEGORY_LABEL,
    description: e.description,
    amount_eur: e.amount_eur,
    beneficiary_member_id: e.beneficiary_member_id,
    invoice_no: e.invoice_no,
    payment_method: e.payment_method,
    paid_by: e.paid_by,
    paid_by_member_id: e.paid_by_member_id,
    funding_sponsor_id: e.funding_sponsor_id,
    status: e.status,
    reimbursed: e.reimbursed,
    reimbursed_note: e.reimbursed_note,
    notes: e.notes,
    receipt_paths: e.receipt_paths ?? [],
  }));

  // ---- filters -------------------------------------------------------------
  const needle = query.toLowerCase();
  const rows = expenses.filter((e) => {
    if (categoryFilter !== ALL && e.category_id !== categoryFilter) return false;
    if (beneficiaryFilter === "club") {
      if (e.beneficiary_member_id) return false;
    } else if (beneficiaryFilter !== ALL && e.beneficiary_member_id !== beneficiaryFilter) {
      return false;
    }
    if (statusFilter !== ALL && e.status !== statusFilter) return false;
    if (sponsorFilter === "none") {
      if (e.funding_sponsor_id) return false;
    } else if (sponsorFilter !== ALL && e.funding_sponsor_id !== sponsorFilter) {
      return false;
    }
    if (payerFilter === "club") {
      if (e.paid_by !== "club") return false;
    } else if (payerFilter !== ALL && e.paid_by_member_id !== payerFilter) {
      return false;
    }
    if (owedOnly && !isOwedToMember(e)) return false;
    if (noReceiptOnly && e.receipt_paths.length > 0) return false;
    if (needle) {
      const hay = [
        e.description, e.notes ?? "", e.invoice_no ?? "", e.category_name,
        e.beneficiary_member_id ? memberName.get(e.beneficiary_member_id) ?? UNKNOWN_MEMBER_LABEL : "Klubi",
      ].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // ---- totals of exactly what is on screen ---------------------------------
  // sumAmounts, never sumEur: a cost with no agreed price is unknown, not free,
  // and the label carries that count instead of hiding it in a zero.
  const shown = sumAmounts(rows);
  const paid = sumAmounts(rows.filter((e) => e.status === "paid"));
  const unpaid = sumAmounts(rows.filter((e) => e.status === "unpaid"));
  const owedDebts = owedToMembers(owedRows);
  const owedTotal = owedToMembersTotal(owedRows);

  // Category breakdown of the filtered set, biggest first.
  const byCategory = new Map<string, { name: string; rows: ExpenseView[] }>();
  for (const e of rows) {
    const slot = byCategory.get(e.category_id) ?? { name: e.category_name, rows: [] };
    slot.rows.push(e);
    byCategory.set(e.category_id, slot);
  }
  const categoryTotals = [...byCategory.entries()]
    .map(([id, v]) => ({ id, name: v.name, total: sumAmounts(v.rows) }))
    .sort((a, b) => b.total.total - a.total.total || b.total.missing - a.total.missing);

  // ---- year picker ---------------------------------------------------------
  // Built from the two bounds, so it spans every year the ledger covers and
  // stops at the newest one — which is also the default, so the default is
  // always a chip you can come back to. A row dated past this year is offered
  // as its own chip without the dead years in between (see yearSpan).
  const years = yearChoices(yearSpan(oldest, newest), year);

  const base = "/admin/finance/expenses";
  const link = (
    over: Partial<Record<"y" | "cat" | "b" | "st" | "sp" | "pb" | "owed" | "q" | "rcpt", string>>,
  ) => {
    const current: Record<string, string> = {
      y: year, cat: categoryFilter, b: beneficiaryFilter, st: statusFilter,
      sp: sponsorFilter, pb: payerFilter, owed: owedOnly ? "1" : "", q: query,
      rcpt: noReceiptOnly ? "0" : "",
    };
    const merged = { ...current, ...over };
    const params = new URLSearchParams();
    // The default year is left out of the querystring — it is what a bare URL
    // resolves to anyway. `defaultY`, never currentYear(): leaving out a year
    // that is NOT the default would produce a link that lands somewhere else.
    if (merged.y && merged.y !== defaultY) params.set("y", merged.y);
    if (merged.cat && merged.cat !== ALL) params.set("cat", merged.cat);
    if (merged.b && merged.b !== ALL) params.set("b", merged.b);
    if (merged.st && merged.st !== ALL) params.set("st", merged.st);
    if (merged.sp && merged.sp !== ALL) params.set("sp", merged.sp);
    if (merged.pb && merged.pb !== ALL) params.set("pb", merged.pb);
    if (merged.owed === "1") params.set("owed", "1");
    if (merged.rcpt === "0") params.set("rcpt", "0");
    if (merged.q) params.set("q", merged.q);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };

  /**
   * The Pasqyra, WITH this screen's window spelled out. The Pasqyra resolves a
   * bare ?y= against its own newest movement, which is not always this ledger's
   * newest shpenzim, so a cross-screen link always says which year it means.
   */
  const overviewLink = `/admin/finance/overview?y=${encodeURIComponent(year)}`;

  const yearLabel = yearWindowLabel(year);
  const filtered =
    categoryFilter !== ALL || beneficiaryFilter !== ALL || statusFilter !== ALL
    || sponsorFilter !== ALL || payerFilter !== ALL || owedOnly || noReceiptOnly || !!query;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shpenzimet e klubit</h1>
          <div className="sub">
            Çka del nga arka e klubit — {yearLabel}. <Link href="/admin/finance">Faturat e anëtarëve</Link>
            {" · "}<Link href={overviewLink}>Pasqyra financiare</Link>
            {isAdmin ? <>{" · "}<Link href="/admin/finance/expenses/categories">Kategoritë</Link></> : null}
          </div>
        </div>
        {canWrite ? <NewExpenseButton options={options} /> : null}
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 16 }}>
        <Kpi
          accent="#2E90FA"
          label="Gjithsej të shfaqura"
          value={amountTotalValue(shown)}
          sub={`${expenseCount(rows.length)}${shown.missing > 0 ? ` · ${shown.missing} pa shumë` : ""}`}
        />
        <Kpi
          accent="#16A34A"
          label="Paguar"
          value={amountTotalValue(paid)}
          sub={`${expenseCount(paid.counted + paid.missing)}${paid.missing > 0 ? ` · ${paid.missing} pa shumë` : ""}`}
        />
        <Kpi
          accent="#E0562D"
          label="Papaguar"
          value={amountTotalValue(unpaid)}
          sub={`${expenseCount(unpaid.counted + unpaid.missing)}${unpaid.missing > 0 ? ` · ${unpaid.missing} pa shumë` : ""}`}
        />
        <Kpi
          accent="#B42318"
          label="Borxh ndaj anëtarëve"
          value={amountTotalValue(owedTotal)}
          sub={
            owedDebts.length === 0
              ? "asnjë shpenzim i pa rimbursuar"
              : `${owedDebts.length} ${owedDebts.length === 1 ? "person" : "persona"}${owedTotal.missing > 0 ? ` · ${owedTotal.missing} pa shumë` : ""} · ${ALL_TIME_NOTE}`
          }
        />
      </div>

      {owedDebts.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>Klubi u ka borxh</h3>
            <span className="kicker">shpenzime të paguara nga xhepi</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {owedDebts.map((d) => (
              <Link
                key={d.memberId}
                className="chip"
                href={link({ owed: "1", y: ALL, st: ALL, cat: ALL, b: ALL, sp: ALL, rcpt: "", q: "", pb: d.memberId })}
                style={{ textDecoration: "none" }}
              >
                {memberName.get(d.memberId) ?? UNKNOWN_MEMBER_LABEL} · {amountTotalLabel({ total: d.total, missing: d.missing, counted: d.count - d.missing })}
              </Link>
            ))}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
            Shlyerja bëhet shpesh në natyrë (p.sh. me naftë). Hape shpenzimin dhe shtyp
            “Shëno si të rimbursuar” me shënimin se si u shlye.
          </p>
        </div>
      ) : null}

      {/* ---- filters ---- */}
      <div className="filter-bar">
        {STATUS_FILTERS.map((s) => (
          <Link key={s.value} className={`chip ${statusFilter === s.value ? "active" : ""}`} href={link({ st: s.value })}>
            {s.label}
          </Link>
        ))}
        <Link className={`chip ${owedOnly ? "active" : ""}`} href={link({ owed: owedOnly ? "" : "1" })}>
          Më ka mbetur borxh
        </Link>
        <Link className={`chip ${noReceiptOnly ? "active" : ""}`} href={link({ rcpt: noReceiptOnly ? "" : "0" })}>
          Pa foto të faturës
        </Link>
        {/* Clears every filter but KEEPS the year window. */}
        {filtered ? (
          <Link
            className="chip"
            href={link({ cat: ALL, b: ALL, st: ALL, sp: ALL, pb: ALL, owed: "", rcpt: "", q: "" })}
          >
            Pastro filtrat
          </Link>
        ) : null}
      </div>

      <ExpenseFilters
        base={base}
        defaultY={defaultY}
        years={years}
        categories={categoryRows.map((c) => ({ value: c.id, label: `${c.name_sq}${c.active ? "" : " (joaktive)"}` }))}
        members={memberRows.map((m) => ({ value: m.id, label: m.full_name }))}
        sponsors={sponsorRows.map((s) => ({ value: s.id, label: s.name }))}
        value={{
          y: year, cat: categoryFilter, b: beneficiaryFilter, st: statusFilter,
          sp: sponsorFilter, pb: payerFilter, owed: owedOnly, q: query,
        }}
      />

      {raw.length >= ROW_CAP ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 10px" }}>
          Shfaqen {ROW_CAP} shpenzimet e para të kësaj periudhe. Ngushtoje me vit ose me kategori.
        </div>
      ) : null}

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Data</th>
              <th>Shpenzimi</th>
              <th>Për kë</th>
              {/* .num on the header as well as the cell, or the title sits left
                  of the digits it names. */}
              <th className="num">Shuma</th>
              <th>Paguar nga</th>
              <th>Statusi</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {expenses.length === 0
                    ? `Nuk ka asnjë shpenzim të regjistruar për ${yearLabel}. Shtyp “Shto shpenzim” për të nisur.`
                    : "Asnjë shpenzim nuk i përgjigjet këtyre filtrave."}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <ExpenseRow key={e.id} expense={e} options={options} canWrite={canWrite} canDelete={isAdmin} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {categoryTotals.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h3>Sipas kategorisë</h3>
            <span className="kicker">{amountTotalLabel(shown)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {categoryTotals.map((c) => (
              <Link key={c.id} className={`chip ${categoryFilter === c.id ? "active" : ""}`} href={link({ cat: c.id })}>
                {c.name} · {amountTotalLabel(c.total)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
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
      <div className="val" style={{ fontSize: 30 }}>{value}</div>
      {sub ? <div className="delta">{sub}</div> : null}
    </div>
  );
}
