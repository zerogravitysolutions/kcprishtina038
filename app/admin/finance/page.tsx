import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  currentPeriod, effectiveStatus, formatEur, isOutstanding, outstandingTotal,
  parsePeriodParam, periodLabel, periodParam, shiftPeriod, sumEur,
  type EffectiveDuesStatus,
} from "@/lib/finance";
import type { DuesStatus, PaidMethod } from "@/lib/supabase/types";
import { GenerateInvoices } from "./GenerateInvoices";
import { InvoiceRow, type InvoiceView } from "./InvoiceRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Faturat e anëtarëve" };

// dues_select_staff / dues_write_staff (migration 0006) — admin + staff.
const FINANCE_ROLES = ["admin", "staff"];

// One month of invoices is small; the cap only exists so a runaway period can
// never render thousands of rows. The UI says so when it bites.
const ROW_CAP = 300;

/** "1 faturë" / "3 fatura" — a bare count reads wrong in the singular. */
function invoiceCount(n: number): string {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Të gjitha" },
  { value: "paid", label: "Paguar" },
  { value: "unpaid", label: "Papaguar" },
  { value: "overdue", label: "Në vonesë" },
  { value: "waived", label: "E falur" },
];

// What Supabase gives back for the select below, before it is flattened.
type DueRow = {
  id: string;
  member_id: string;
  period: string;
  due_date: string | null;
  amount_eur: number;
  status: DuesStatus;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  invoice_no: string | null;
  notes: string | null;
  member: { id: string; full_name: string; email: string } | null;
  membership: { id: string; billable: boolean; plan: { name_sq: string } | null } | null;
};

const SELECT =
  "id, member_id, period, due_date, amount_eur, status, paid_at, paid_method, invoice_no, notes, " +
  "member:profiles!member_id(id, full_name, email), " +
  "membership:memberships!membership_id(id, billable, plan:membership_plans!plan_id(name_sq))";

type SearchParams = Promise<{ p?: string; st?: string; q?: string }>;

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const period = parsePeriodParam(sp.p);
  const statusFilter = STATUS_FILTERS.some((s) => s.value === sp.st) ? sp.st! : "all";
  const query = (sp.q ?? "").trim();

  const supabase = await createClient();
  // ONE select: the invoices of the selected month, which is exactly what this
  // screen shows. The all-periods debt read that used to sit next to it (and
  // fed two KPIs about rows that are not on screen) now lives once, on the
  // Pasqyra financiare — three copies of that figure was how the panel started
  // printing different euros under the same word.
  //
  // Ordered before the cap: an unordered limit would return an arbitrary slice,
  // so which invoices got dropped would change between refreshes.
  const invoiceRes = await supabase
    .from("dues")
    .select(SELECT)
    .eq("period", period)
    .order("created_at", { ascending: true })
    .limit(ROW_CAP);

  const loadError = invoiceRes.error;
  if (loadError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Faturat e anëtarëve</h1>
            <div className="sub">Faturat mujore të akademisë.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(loadError, "Leximi i faturave dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Nëse kjo përsëritet, ka gjasa që skema e faturimit nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const raw = (invoiceRes.data as unknown as DueRow[] | null) ?? [];

  const invoices: InvoiceView[] = raw.map((d) => ({
    id: d.id,
    invoice_no: d.invoice_no,
    period: d.period,
    due_date: d.due_date,
    amount_eur: d.amount_eur,
    status: d.status,
    paid_at: d.paid_at,
    paid_method: d.paid_method,
    notes: d.notes,
    member_name: d.member?.full_name ?? "Anëtar i panjohur",
    member_email: d.member?.email ?? "Pa email",
    plan_name: d.membership?.plan?.name_sq ?? null,
    plan_billable: d.membership ? d.membership.billable : null,
  }));

  // ---- overview for the selected month -------------------------------------
  const collectedRows = invoices.filter((i) => effectiveStatus(i) === "paid");
  const waivedRows = invoices.filter((i) => effectiveStatus(i) === "waived");
  const outstandingRows = invoices.filter(isOutstanding);
  // "Faturuar" EXCLUDES waived invoices, for two reasons that are the same
  // reason: a forgiven invoice is neither income nor debt, so counting it here
  // would (a) break this row's own arithmetic — Faturuar would no longer equal
  // Arkëtuar + Pa arkëtuar — and (b) put a different euro figure under the word
  // "Faturuar" than the Pasqyra shows for the same month. The waived total is
  // reported on its own line below.
  const billedRows = invoices.filter((i) => effectiveStatus(i) !== "waived");
  const billed = sumEur(billedRows);
  const collected = sumEur(collectedRows);
  const outstanding = outstandingTotal(invoices);

  // ---- filtered list -------------------------------------------------------
  const needle = query.toLowerCase();
  const rank: Record<EffectiveDuesStatus, number> = { overdue: 0, unpaid: 1, paid: 2, waived: 3 };
  const rows = invoices
    .filter((i) => statusFilter === "all" || effectiveStatus(i) === statusFilter)
    .filter((i) => !needle
      || i.member_name.toLowerCase().includes(needle)
      || i.member_email.toLowerCase().includes(needle))
    .sort((a, b) => {
      const d = rank[effectiveStatus(a)] - rank[effectiveStatus(b)];
      return d !== 0 ? d : a.member_name.localeCompare(b.member_name, "sq");
    });

  const label = periodLabel(period);
  const prev = periodParam(shiftPeriod(period, -1));
  const next = periodParam(shiftPeriod(period, 1));
  const isCurrent = period === currentPeriod();
  const base = "/admin/finance";
  const link = (over: { p?: string; st?: string; q?: string }) => {
    const params = new URLSearchParams();
    const p = over.p ?? periodParam(period);
    const st = over.st ?? statusFilter;
    const q = over.q ?? query;
    if (p !== periodParam(currentPeriod())) params.set("p", p);
    if (st !== "all") params.set("st", st);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Faturat e anëtarëve</h1>
          <div className="sub">
            Faturat mujore të akademisë për {label}.{" "}
            <Link href="/admin/finance/overview?v=borxhet">Borxhi i anëtarëve</Link>
            {" · "}<Link href="/admin/finance/overview?v=anetaresia">Të hyrat e akademisë</Link>
            {profile.role === "admin" ? <>{" · "}<Link href="/admin/plans">Planet</Link></> : null}
          </div>
        </div>
        <GenerateInvoices
          period={period}
          label={label}
          when={isCurrent ? "current" : period > currentPeriod() ? "future" : "past"}
        />
      </div>

      {/* Exactly the totals of the rows on screen — a table footer, not a
          report. The collection rate and the all-periods member debt used to
          sit here too; both summarised data that is NOT in this list, off a
          300-row cap, and both now live once on the Pasqyra financiare. */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 16 }}>
        <Kpi accent="#2E90FA" label="Faturuar" value={formatEur(billed)} sub={`${invoiceCount(billedRows.length)} · ${label}`} />
        <Kpi accent="#16A34A" label="Arkëtuar" value={formatEur(collected)} sub={`${invoiceCount(collectedRows.length)} të paguara`} />
        <Kpi accent="#E0562D" label="Pa arkëtuar" value={formatEur(outstanding)} sub={`${invoiceCount(outstandingRows.length)} të hapura`} />
      </div>

      {waivedRows.length > 0 ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 12px" }}>
          {invoiceCount(waivedRows.length)} të falura ({formatEur(sumEur(waivedRows))}) nuk llogariten as te faturimi, as te arkëtimi, as te borxhi.
        </div>
      ) : null}

      <div className="filter-bar">
        <Link className="chip" href={link({ p: prev })}>← {periodLabel(shiftPeriod(period, -1))}</Link>
        <span className="chip active">{label}</span>
        <Link className="chip" href={link({ p: next })}>{periodLabel(shiftPeriod(period, 1))} →</Link>
        {!isCurrent ? (
          <Link className="chip" href={link({ p: periodParam(currentPeriod()) })}>Muaji aktual</Link>
        ) : null}
        <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--line-strong)", margin: "2px 4px" }} />
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s.value}
            className={`chip ${statusFilter === s.value ? "active" : ""}`}
            href={link({ st: s.value })}
          >
            {s.label}
          </Link>
        ))}
        <div className="spacer" />
        <form method="get" action={base} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {periodParam(period) !== periodParam(currentPeriod())
            ? <input type="hidden" name="p" value={periodParam(period)} /> : null}
          {statusFilter !== "all" ? <input type="hidden" name="st" value={statusFilter} /> : null}
          <input type="search" name="q" defaultValue={query} placeholder="Kërko anëtar…" aria-label="Kërko anëtar" />
          <button type="submit" className="btn btn-sm">Kërko</button>
          {query ? <Link className="chip" href={link({ q: "" })}>Pastro</Link> : null}
        </form>
      </div>

      {raw.length >= ROW_CAP ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 10px" }}>
          Shfaqen {ROW_CAP} faturat e para të këtij muaji. Përdor kërkimin për të gjetur një anëtar të caktuar.
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Anëtari</th>
              <th>Plani</th>
              <th>Fatura</th>
              <th>Shuma</th>
              <th>Afati</th>
              <th>Statusi</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {invoices.length === 0
                    ? period > currentPeriod()
                      ? `Nuk ka fatura për ${label}. Ky muaj nuk ka filluar ende.`
                      : `Nuk ka fatura për ${label}. Shtyp “Gjenero faturat për ${label}” për t’i krijuar.`
                    : "Asnjë faturë nuk i përgjigjet këtij filtri."}
                </td>
              </tr>
            ) : (
              rows.map((inv) => <InvoiceRow key={inv.id} inv={inv} canWrite />)
            )}
          </tbody>
        </table>
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
