import "../invoice.css";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { CLUB, PAYMENT_FALLBACK } from "@/lib/club";
import {
  EFFECTIVE_STATUS_LABEL, EFFECTIVE_STATUS_TONE, PAID_METHOD_LABEL,
  daysOverdue, dueDateOf, effectiveStatus, formatEur, isOutstanding, issuedDateLabel, periodLabel,
} from "@/lib/finance";
import type { DuesStatus, PaidMethod } from "@/lib/supabase/types";
import { PrintButton } from "./PrintButton";

// A document about money must never be served from a cache: the status line is
// the difference between "paguar" and "në vonesë".
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ id: string }>;

/**
 * One route, two audiences — staff opening any invoice and a member opening
 * their own — because RLS (dues_select_own / dues_select_staff) already draws
 * exactly that line. Nothing here re-checks the role: a member who guesses
 * someone else's uuid gets zero rows back and therefore the Albanian 404.
 *
 * The cookie-backed client is mandatory. createAdminClient would bypass RLS and
 * hand any logged-in member every invoice in the club; createPublicClient would
 * carry no session at all.
 */
const SELECT =
  "id, member_id, period, due_date, issued_on, amount_eur, status, paid_at, paid_method, invoice_no, created_at, " +
  "member:profiles!member_id(full_name, email), " +
  "membership:memberships!membership_id(plan:membership_plans!plan_id(name_sq))";

type InvoiceData = {
  id: string;
  member_id: string;
  period: string;
  due_date: string | null;
  issued_on: string | null;
  amount_eur: number;
  status: DuesStatus;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  invoice_no: string | null;
  created_at: string;
  member: { full_name: string; email: string } | null;
  membership: { plan: { name_sq: string } | null } | null;
};

/**
 * The human invoice number, or null when there isn't one. Trimmed and
 * empty-checked in ONE place: dues.invoice_no is nullable `text` with only a
 * unique constraint, so "" is storable, and `invoice_no ?? id` would then print
 * a blank headline and a blank payment reference while `Boolean(invoice_no)`
 * said the same row had a number.
 */
function invoiceNumber(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Postgres rejects a malformed uuid with 22P02 rather than returning no rows,
// which would surface as a database error instead of the 404 it actually is.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never print "Invalid Date" if a stored timestamp is unparseable. */
function timestampLabel(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sq");
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  // The browser names the saved PDF after the document title, so the invoice
  // number belongs in it — a member archiving six months of invoices otherwise
  // ends up with six files called "Faturë". Same RLS, so this leaks nothing.
  let no: string | null = null;
  if (UUID.test(id)) {
    const supabase = await createClient();
    const { data } = await supabase.from("dues").select("invoice_no").eq("id", id).maybeSingle();
    no = invoiceNumber((data as { invoice_no: string | null } | null)?.invoice_no ?? null);
  }
  // A legacy row has no number, so the first block of its uuid stands in — six
  // archived invoices all called "Faturë" is the problem this title solves, and
  // it stays a problem if every pre-numbering invoice shares the same title.
  const suffix = no ?? (UUID.test(id) ? id.slice(0, 8) : null);
  return {
    title: suffix ? `Faturë ${suffix}` : "Faturë",
    robots: { index: false, follow: false },
  };
}

export default async function InvoicePage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invoice/${id}`)}`);
  if (!UUID.test(id)) notFound();

  const { data, error } = await supabase.from("dues").select(SELECT).eq("id", id).maybeSingle();

  // An outage must not masquerade as "kjo faturë nuk ekziston" — that sentence
  // would send a member who does owe money away thinking they do not.
  if (error) {
    return (
      <div className="inv-shell">
        <div className="inv-err">
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>
            {dbError(error, "Leximi i faturës dështoi.")}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-3, #2a3858)" }}>
            Rifresko faqen dhe, nëse përsëritet, njofto klubin në {CLUB.email}.
          </p>
        </div>
      </div>
    );
  }

  const inv = data as unknown as InvoiceData | null;
  if (!inv) notFound();

  const status = effectiveStatus(inv);
  const late = daysOverdue(inv);
  const due = dueDateOf(inv);
  const paidAt = timestampLabel(inv.paid_at);
  // The INVOICE DATE the member sees: the explicit issued_on set when the
  // invoice was raised, falling back to created_at for rows generated before
  // issued_on existed. Never "Invalid Date" for a missing date.
  const issued = issuedDateLabel(inv.issued_on, inv.created_at);
  const period = periodLabel(inv.period);
  const amount = formatEur(inv.amount_eur);
  const outstanding = isOutstanding(inv);

  // A legacy row has no invoice_no, so the uuid becomes the sole identifier —
  // printing "Pa numër" as though it were the number would give two invoices
  // the same "number".
  const no = invoiceNumber(inv.invoice_no);
  const hasNo = no !== null;
  const headline = no ?? inv.id;
  const reference = no ?? inv.id;

  // The plan and the amount come from THIS invoice and the membership it was
  // billed under — never from the member's current plan, or a rider promoted to
  // garues would see last spring's invoices restated as "nuk faturohet".
  const planName = inv.membership
    ? inv.membership.plan?.name_sq ?? "Plan i arkivuar"
    : null;

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
              {/* Omitted entirely while unset — an empty "NUI:" would look like
                  a number the club forgot to print. */}
              {CLUB.fiscalNumber ? <span>Numri fiskal: {CLUB.fiscalNumber}</span> : null}
            </p>
          </div>

          <div className="inv-ident">
            <div className="inv-ident__kicker">Faturë</div>
            <div className={`inv-ident__no${hasNo ? "" : " is-uuid"}`}>{headline}</div>
            {hasNo ? (
              <div className="inv-ident__uuid">
                Referencë unike
                <b>{inv.id}</b>
              </div>
            ) : (
              <div className="inv-ident__uuid">
                Kjo faturë është lëshuar para se numërimi i faturave të hynte në sistem,
                prandaj identifikohet vetëm me këtë referencë unike.
              </div>
            )}
          </div>
        </header>

        {/* --------------------------------------------------------- dates */}
        <section className="inv-meta">
          <div>
            <div className="inv-meta__lab">Periudha</div>
            <div className="inv-meta__val">{period}</div>
          </div>
          <div>
            <div className="inv-meta__lab">Data e lëshimit</div>
            <div className="inv-meta__val">{issued ?? "e pashënuar"}</div>
          </div>
          <div>
            <div className="inv-meta__lab">Afati i pagesës</div>
            <div className="inv-meta__val">{due ? due.toLocaleDateString("sq") : "pa afat"}</div>
          </div>
        </section>

        {/* ----------------------------------------------------- billed to */}
        <section className="inv-to">
          <div className="inv-lab">Faturuar për</div>
          <div className="inv-to__name">{inv.member?.full_name ?? "Anëtar i panjohur"}</div>
          <div className="inv-to__mail">{inv.member?.email ?? "Pa email"}</div>
        </section>

        {/* ---------------------------------------------------- line items */}
        <table className="inv-table">
          <thead>
            <tr>
              <th>Përshkrimi</th>
              <th>Periudha</th>
              <th>Shuma</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="inv-item__name">{planName ?? "Anëtarësi mujore"}</span>
                <span className="inv-item__sub">Kuota mujore e anëtarësisë për {period}</span>
              </td>
              <td className="mono" style={{ fontSize: 13 }}>{period}</td>
              <td className="num">{amount}</td>
            </tr>
          </tbody>
        </table>

        <div className="inv-total">
          <span className="inv-lab">Gjithsej</span>
          <span className="inv-total__val">{amount}</span>
        </div>

        {/* -------------------------------------------------------- status */}
        <section className="inv-block">
          <div className="inv-block__head">
            <span className="inv-lab">Statusi</span>
            <span className={`inv-badge ${EFFECTIVE_STATUS_TONE[status]}`}>
              {EFFECTIVE_STATUS_LABEL[status]}
            </span>
          </div>
          {status === "paid" ? (
            <p>
              Kjo faturë është paguar{paidAt ? ` më ${paidAt}` : ""}.{" "}
              {inv.paid_method ? `Mënyra e pagesës: ${PAID_METHOD_LABEL[inv.paid_method]}. ` : ""}
              Nuk mbetet asgjë për të paguar — ky dokument vlen si vërtetim i pagesës.
            </p>
          ) : status === "waived" ? (
            <p>
              Klubi e ka falur këtë faturë. Nuk ke asgjë për të paguar dhe kjo shumë nuk
              llogaritet as si borxh, as si pagesë.
            </p>
          ) : status === "overdue" ? (
            <p>
              Afati i pagesës skadoi{due ? ` më ${due.toLocaleDateString("sq")}` : ""} — {late} ditë
              vonesë. Shuma prej {amount} pritet të paguhet sa më parë.
            </p>
          ) : (
            <p>
              Shuma prej {amount} pritet të paguhet
              {due ? ` deri më ${due.toLocaleDateString("sq")}` : " te klubi"}.
            </p>
          )}
        </section>

        {/* ------------------------------------------------------- payment */}
        {outstanding ? (
          <section className="inv-block inv-pay">
            <span className="inv-lab">Si të paguash</span>
            {CLUB.bank ? (
              <>
                <div className="inv-pay__rows">
                  <div>
                    <div className="inv-lab">Banka</div>
                    <div className="inv-pay__val">{CLUB.bank.bankName}</div>
                  </div>
                  <div>
                    <div className="inv-lab">Përfituesi</div>
                    <div className="inv-pay__val">{CLUB.bank.accountName}</div>
                  </div>
                  <div>
                    <div className="inv-lab">IBAN</div>
                    <div className="inv-pay__val">{CLUB.bank.iban}</div>
                  </div>
                  {CLUB.bank.swift ? (
                    <div>
                      <div className="inv-lab">SWIFT</div>
                      <div className="inv-pay__val">{CLUB.bank.swift}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="inv-lab">Referenca e pagesës</div>
                    <div className="inv-pay__val">{reference}</div>
                  </div>
                  <div>
                    <div className="inv-lab">Shuma</div>
                    <div className="inv-pay__val">{amount}</div>
                  </div>
                </div>
                <p>
                  Shkruaje referencën e pagesës te përshkrimi i transferit, që klubi ta lidhë
                  pagesën me këtë faturë. Mund të paguash edhe te zyra e klubit.
                </p>
              </>
            ) : (
              <p>{PAYMENT_FALLBACK}</p>
            )}
          </section>
        ) : null}

        {/* ---------------------------------------------------------- foot */}
        <footer className="inv-foot">
          <p>
            Kjo faturë është për anëtarësinë mujore në {CLUB.shortName} dhe nuk është kupon
            fiskal apo dokument tatimor.
          </p>
          <p>
            Për çdo pyetje rreth kësaj fature, shkruaj në {CLUB.email} duke e cituar referencën{" "}
            {reference}.
          </p>
        </footer>
      </article>
    </div>
  );
}
