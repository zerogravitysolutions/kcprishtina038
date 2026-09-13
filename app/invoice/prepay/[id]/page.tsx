import "../../invoice.css";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { CLUB } from "@/lib/club";
import {
  PAID_METHOD_LABEL, discountReasonLabel, formatDate, formatEur, isReduced, periodLabel, periodParam, toEuros,
} from "@/lib/finance";
import { monthCount, prepayRangeLabel } from "@/lib/prepay";
import type { DuesStatus } from "@/lib/supabase/types";
import { PrintButton } from "../../[id]/PrintButton";
import { UndoPrepayment } from "./UndoPrepayment";

// A document about money must never be served from a cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ id: string }>;

/**
 * The printable record of one prepayment — EXACTLY the access model of
 * /invoice/[id]: one route for staff opening any prepayment and a member
 * opening their own, drawn by RLS (dues_prepayments_select_own / _staff, and
 * dues_select_own / _staff for its invoices). Nothing here re-checks the role
 * for reading: a member who guesses someone else's uuid gets zero rows and the
 * Albanian 404. The cookie-backed client is mandatory — the admin client would
 * bypass RLS and hand any member every prepayment in the club.
 *
 * The role IS read for one thing only: whether to offer "Anulo parapagimin".
 * Hiding it is tidiness; undoPrepayment() and undo_prepayment() both re-check.
 */
const SELECT =
  "id, member_id, first_period, months, paid_on, paid_method, total_eur, notes, created_at, prior_states, " +
  "member:profiles!member_id(full_name, email)";

const ROWS_SELECT =
  "id, period, invoice_no, amount_eur, full_amount_eur, discount_reason, status, " +
  "membership:memberships!membership_id(plan:membership_plans!plan_id(name_sq))";

type PrepayData = {
  id: string;
  member_id: string;
  first_period: string;
  months: number;
  paid_on: string;
  paid_method: "cash" | "bank" | "online";
  total_eur: number | string;
  notes: string | null;
  created_at: string;
  prior_states: unknown;
  member: { full_name: string; email: string } | null;
};

type RowData = {
  id: string;
  period: string;
  invoice_no: string | null;
  amount_eur: number | string;
  full_amount_eur: number | string | null;
  discount_reason: string | null;
  status: DuesStatus;
  membership: { plan: { name_sq: string } | null } | null;
};

// Postgres rejects a malformed uuid with 22P02 rather than returning no rows.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids of the invoices that existed BEFORE the prepayment marked them paid. */
function priorIds(value: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(value)) return out;
  for (const e of value) {
    const id = (e as { id?: unknown } | null)?.id;
    if (typeof id === "string") out.add(id);
  }
  return out;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  // The saved PDF is named after the title, so the months belong in it. Same
  // RLS as the page, so this leaks nothing.
  let range = "";
  if (UUID.test(id)) {
    const supabase = await createClient();
    const { data } = await supabase.from("dues_prepayments").select("first_period, months").eq("id", id).maybeSingle();
    const row = data as { first_period: string; months: number } | null;
    if (row) range = prepayRangeLabel(row.first_period, row.months);
  }
  return {
    title: range ? `Parapagim ${range}` : "Parapagim",
    robots: { index: false, follow: false },
  };
}

export default async function PrepaymentPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invoice/prepay/${id}`)}`);
  if (!UUID.test(id)) notFound();

  const [ppRes, rowsRes] = await Promise.all([
    supabase.from("dues_prepayments").select(SELECT).eq("id", id).maybeSingle(),
    supabase.from("dues").select(ROWS_SELECT).eq("prepayment_id", id).order("period", { ascending: true }),
  ]);

  // An outage must not masquerade as "this prepayment does not exist".
  const error = ppRes.error ?? rowsRes.error;
  if (error) {
    return (
      <div className="inv-shell">
        <div className="inv-err">
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>
            {dbError(error, "Leximi i parapagimit dështoi.")}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-3, #2a3858)" }}>
            Rifresko faqen dhe, nëse përsëritet, njofto klubin në {CLUB.email}.
          </p>
        </div>
      </div>
    );
  }

  const pp = ppRes.data as unknown as PrepayData | null;
  if (!pp) notFound();
  const rows = (rowsRes.data as unknown as RowData[] | null) ?? [];

  const range = prepayRangeLabel(pp.first_period, pp.months);
  const total = formatEur(toEuros(pp.total_eur));
  const paidOn = formatDate(pp.paid_on);
  const methodLabel = PAID_METHOD_LABEL[pp.paid_method] ?? pp.paid_method;
  const memberName = pp.member?.full_name ?? "Anëtar i panjohur";
  const anyReduced = rows.some((r) => isReduced(r));

  const profile = await getProfile();
  const isAdmin = profile?.role === "admin" && profile.status === "active";
  const before = priorIds(pp.prior_states);
  const label = (r: RowData) => ({ invoice_no: r.invoice_no, month: periodLabel(r.period) });
  const created = rows.filter((r) => !before.has(r.id)).map(label);
  const restored = rows.filter((r) => before.has(r.id)).map(label);

  return (
    <div className="inv-shell">
      <div className="inv-bar">
        <p className="inv-bar__hint">
          Shtyp “Printo” dhe, te dritarja e printimit, zgjidh printerin ose “Ruaj si PDF”.
        </p>
        <PrintButton />
      </div>

      <article className="inv-sheet">
        {/* ---------------------------------------------------- letterhead */}
        <header className="inv-head">
          <div>
            <h1 className="inv-club__name">{CLUB.shortName}</h1>
            <p className="inv-club__legal">{CLUB.legalName}</p>
            <p className="inv-club__lines">
              <span>{CLUB.address}</span>
              <span>{CLUB.email} · {CLUB.website}</span>
              <span>{CLUB.registration}</span>
              {CLUB.fiscalNumber ? <span>Numri fiskal: {CLUB.fiscalNumber}</span> : null}
            </p>
          </div>

          <div className="inv-ident">
            <div className="inv-ident__kicker">Parapagim</div>
            <div className="inv-ident__no">{range || monthCount(pp.months)}</div>
            <div className="inv-ident__uuid">
              Referencë unike
              <b>{pp.id}</b>
            </div>
          </div>
        </header>

        {/* --------------------------------------------------------- dates */}
        <section className="inv-meta">
          <div>
            <div className="inv-meta__lab">Periudha</div>
            <div className="inv-meta__val">{range} · {monthCount(pp.months)}</div>
          </div>
          <div>
            <div className="inv-meta__lab">Data e pagesës</div>
            <div className="inv-meta__val">{paidOn}</div>
          </div>
          <div>
            <div className="inv-meta__lab">Mënyra e pagesës</div>
            <div className="inv-meta__val">{methodLabel}</div>
          </div>
        </section>

        {/* ----------------------------------------------------- paid by */}
        <section className="inv-to">
          <div className="inv-lab">Paguar nga</div>
          <div className="inv-to__name">{memberName}</div>
          <div className="inv-to__mail">{pp.member?.email ?? "Pa email"}</div>
        </section>

        {/* ------------------------------------------------------ months */}
        <table className="inv-table">
          <thead>
            <tr>
              <th>Muaji</th>
              <th>Fatura</th>
              <th>Shuma</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <span className="inv-item__sub">Asnjë faturë nuk është më e lidhur me këtë parapagim.</span>
                </td>
              </tr>
            ) : rows.map((r) => {
              const reduced = isReduced(r);
              return (
                <tr key={r.id}>
                  <td>
                    <span className="inv-item__name">{periodLabel(r.period)}</span>
                    <span className="inv-item__sub">
                      {r.membership?.plan?.name_sq ?? "Anëtarësi mujore"}
                      {reduced
                        ? ` · ½ çmimi (${discountReasonLabel(r)}), nga ${formatEur(r.full_amount_eur)}`
                        : ""}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    <a href={`/invoice/${r.id}`} style={{ color: "inherit" }}>{r.invoice_no?.trim() || "Pa numër"}</a>
                  </td>
                  <td className="num">{formatEur(r.amount_eur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="inv-total">
          <span className="inv-lab">Gjithsej e paguar</span>
          <span className="inv-total__val">{total}</span>
        </div>

        {/* -------------------------------------------------------- status */}
        <section className="inv-block">
          <div className="inv-block__head">
            <span className="inv-lab">Statusi</span>
            <span className="inv-badge ok">Paguar</span>
          </div>
          <p>
            {memberName} ka paguar {total} më {paidOn} ({methodLabel.toLowerCase()}) për{" "}
            {pp.months === 1 ? `muajin ${range}` : `${monthCount(pp.months)} njëherësh: ${range}`}.
            {" "}Secili muaj ka faturën e vet, të shënuar si të paguar — nuk mbetet asgjë për të paguar për këta muaj,
            dhe klubi nuk i faturon sërish. Ky dokument vlen si vërtetim i pagesës.
          </p>
          {anyReduced ? (
            <p>Muajt me ½ janë me gjysmë çmimi; çmimi i plotë shënohet pranë tyre.</p>
          ) : null}
        </section>

        {pp.notes ? (
          <section className="inv-block">
            <span className="inv-lab">Shënim</span>
            <p>{pp.notes}</p>
          </section>
        ) : null}

        {isAdmin ? (
          <UndoPrepayment
            id={pp.id}
            memberName={memberName}
            rangeLabel={range}
            total={total}
            paidOn={paidOn}
            created={created}
            restored={restored}
            backHref={`/admin/finance?p=${periodParam(pp.first_period)}`}
          />
        ) : null}

        {/* ---------------------------------------------------------- foot */}
        <footer className="inv-foot">
          <p>
            Ky dokument vërteton pagesën e anëtarësisë mujore në {CLUB.shortName} për muajt e mësipërm dhe
            nuk është kupon fiskal apo dokument tatimor.
          </p>
          <p>
            Për çdo pyetje rreth këtij parapagimi, shkruaj në {CLUB.email} duke e cituar referencën {pp.id}.
          </p>
        </footer>
      </article>
    </div>
  );
}
