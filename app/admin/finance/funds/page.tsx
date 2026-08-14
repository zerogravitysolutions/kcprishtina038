import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  FUND_KINDS, FUND_KIND_LABEL, FUND_STATUS_LABEL, UNKNOWN_SPONSOR_LABEL, formatDate, formatEur,
  membershipIncome, sumEur,
} from "@/lib/finance";
import type { ClubFundKind, ClubFundStatus } from "@/lib/supabase/types";
import {
  ALL, ALL_TIME_NOTE, ALL_YEARS_LABEL, currentYear, parseYearParam, yearChoices, yearWindowLabel,
} from "../filters";
// The academy side of "money in" is read through the Pasqyra's own helpers, so
// this page and /admin/finance/overview print the SAME euros for a window.
import {
  PAID_DUES_CAP, paidDuesInYear, readPaidDues, undatedPaidCount, undatedPaidNote, yearOfPayment,
} from "../overview/data";
import { NewFundButton, type FundView, type SponsorOption } from "./FundForm";
import { FundRow } from "./FundRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Hyrjet e klubit" };

// club_funds_select_staff / club_funds_write_staff — admin + staff, nobody else.
const FINANCE_ROLES = ["admin", "staff"];

// The whole table, read once and grouped in memory: a club records a few dozen
// of these a year, and one pass gives the list, the totals and the year chips
// without three round-trips. The cap is surfaced in the UI when it bites — a
// total that was quietly cut short is not a total.
const FUND_CAP = 1000;
const SPONSOR_CAP = 200;

type FundRowData = {
  id: string;
  title: string;
  occurred_on: string;
  amount_eur: number;
  kind: ClubFundKind;
  sponsor_id: string | null;
  status: ClubFundStatus;
  reference: string | null;
  notes: string | null;
};

type SponsorRow = { id: string; name: string; active: boolean };

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "Të gjitha" },
  { value: "received", label: FUND_STATUS_LABEL.received },
  { value: "pledged", label: FUND_STATUS_LABEL.pledged },
];

/** "3 hyrje". The noun does not inflect for number in this construction. */
function fundCount(n: number): string {
  return `${n} hyrje`;
}

/** "1 pagesë" / "4 pagesa". */
function paymentCount(n: number): string {
  return `${n} ${n === 1 ? "pagesë" : "pagesa"}`;
}

/**
 * The two shares of the split, as whole percents that ADD UP TO 100.
 *
 * Rounding each half on its own is what would print "34% / 67%" under a row
 * that says 100% (dues €67 of €200 is 33.5, funds €133 is 66.5, and both round
 * away from the middle). There are exactly two parts here, so the second one is
 * the remainder of the first rather than a second rounding. With nothing in
 * there is no share to take, so all three read "—": that is "no money came in",
 * which is not the same statement as "0% of it came from the academy".
 */
function shares(dues: number, funds: number): { dues: string; funds: string; total: string } {
  const total = dues + funds;
  if (total <= 0) return { dues: "—", funds: "—", total: "—" };
  const d = Math.round((dues / total) * 100);
  return { dues: `${d}%`, funds: `${100 - d}%`, total: "100%" };
}

type SearchParams = Promise<{ y?: string; st?: string; k?: string }>;

export default async function FundsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FINANCE_ROLES.includes(profile.role)) redirect("/admin/dashboard");
  // club_funds_select_staff and club_funds_write_staff grant the SAME two
  // roles, so anyone who can open this page can also write to it. There is no
  // read-only viewer to render a disabled UI for; deleting is the one action
  // held back (see assertAdmin in actions.ts).
  const canDelete = profile.role === "admin";

  const sp = await searchParams;

  const supabase = await createClient();
  const [fundRes, sponsorRes, paid] = await Promise.all([
    supabase
      .from("club_funds")
      .select("id, title, occurred_on, amount_eur, kind, sponsor_id, status, reference, notes")
      .order("occurred_on", { ascending: false })
      .limit(FUND_CAP),
    // Read separately and joined by hand below: the same list feeds the form's
    // sponsor picker, so one query serves both and no PostgREST embed is needed.
    supabase.from("sponsors").select("id, name, active").order("name", { ascending: true }).limit(SPONSOR_CAP),
    // The academy's money. This page is called "Hyrjet e klubit" and kuotat are
    // the club's largest and most regular income, so leaving them out made the
    // title a lie. The invoice DETAIL stays on /admin/finance; what belongs
    // here is the one figure, read exactly as the Pasqyra reads it.
    readPaidDues(supabase),
  ]);

  if (fundRes.error || sponsorRes.error || paid.error) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Hyrjet e klubit</h1>
            <div className="sub">Sponsorizime, projekte, grante dhe donacione.</div>
          </div>
        </div>
        <div className="card">
          {/* The dues read is in here on purpose: if it fails silently the
              academy income renders €0.00 — "asgjë nuk ka hyrë", a lie told in
              green on the very screen that exists to add money up. */}
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(fundRes.error ?? sponsorRes.error ?? paid.error, "Leximi i hyrjeve dështoi.")}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: "var(--text-3)" }}>
            Nëse kjo përsëritet, ka gjasa që skema e financave të klubit nuk është aplikuar ende në bazën e të dhënave.
          </p>
        </div>
      </>
    );
  }

  const all = (fundRes.data as unknown as FundRowData[] | null) ?? [];
  const sponsorRows = (sponsorRes.data as unknown as SponsorRow[] | null) ?? [];
  const sponsors: SponsorOption[] = sponsorRows.map((s) => ({ id: s.id, name: s.name, active: s.active }));
  const sponsorName = new Map(sponsorRows.map((s) => [s.id, s.name]));

  const funds: FundView[] = all.map((f) => ({
    ...f,
    // A deleted sponsor must not hide the money that came from them.
    sponsor_name: f.sponsor_id ? sponsorName.get(f.sponsor_id) ?? UNKNOWN_SPONSOR_LABEL : null,
  }));

  // ---- the window ----------------------------------------------------------
  // The year is the FRAME of this screen and it defaults to the current one;
  // "të gjitha vitet" is the last option, never the state you land in.
  const year = parseYearParam(sp.y);
  const years = yearChoices(
    [
      ...funds.map((f) => f.occurred_on.slice(0, 4)),
      // Payment years too: a year in which the academy collected money is a
      // year with income, even if no sponsor gave anything.
      ...paid.rows.map((d) => yearOfPayment(d.paid_at)).filter((v): v is string => !!v),
    ],
    year,
  );
  const status = STATUS_FILTERS.some((s) => s.value === sp.st) ? sp.st! : ALL;
  const kind = (FUND_KINDS as string[]).includes(sp.k ?? "") ? sp.k! : ALL;
  const yearLabel = yearWindowLabel(year);

  // ---- money in, both sources ----------------------------------------------
  // The summary answers "how much came in this year", so it follows the YEAR
  // only. The status and kind chips scope the ledger below and say so there —
  // a headline that moved when you clicked "Donacion" would be answering a
  // different question from the one the heading asks.
  const yearFunds = funds.filter((f) => year === ALL || f.occurred_on.slice(0, 4) === year);
  const receivedInYear = yearFunds.filter((f) => f.status === "received");
  const fundsIncome = sumEur(receivedInYear);

  const paidInYear = paidDuesInYear(paid.rows, year);
  // Same rows, same bucketing, same helper as the Pasqyra — this figure and
  // "anëtarësi" in Arka e klubit are the same number by construction.
  const duesIncome = membershipIncome(paidInYear);
  const totalIncome = duesIncome + fundsIncome;
  const undatedPaid = undatedPaidCount(paid.rows);

  // Pledges are a POSITION, not a flow of one year: money agreed in 2025 and
  // still not transferred is open today. They are counted across every year,
  // stay OUT of the income total, and the card says both things.
  const pledged = funds.filter((f) => f.status === "pledged");
  const pledgedTotal = sumEur(pledged);

  const split = shares(duesIncome, fundsIncome);

  // ---- the ledger below ----------------------------------------------------
  const inWindow = yearFunds.filter((f) => kind === ALL || f.kind === kind);
  const rows = inWindow.filter((f) => status === ALL || f.status === status);
  // Cash and promises are never added into one figure, not even for a list
  // header: the whole point of `status` is that only one of them is money.
  const rowsReceived = sumEur(rows.filter((f) => f.status === "received"));
  const rowsPledged = sumEur(rows.filter((f) => f.status === "pledged"));

  const base = "/admin/finance/funds";
  const link = (over: { y?: string; st?: string; k?: string }) => {
    const params = new URLSearchParams();
    const y = over.y ?? year;
    const st = over.st ?? status;
    const k = over.k ?? kind;
    // The current year is the default, so it is left out of the querystring.
    if (y !== currentYear()) params.set("y", y);
    if (st !== ALL) params.set("st", st);
    if (k !== ALL) params.set("k", k);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };
  /**
   * Where the invoice DETAIL lives. It deliberately carries no window: that
   * ledger is framed by MONTH (?p=), not by year, so there is no year to hand
   * over — it opens on the current month, which is its own default.
   */
  const invoicesHref = "/admin/finance";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hyrjet e klubit</h1>
          <div className="sub">
            Të gjitha paratë që hyjnë — kuotat e akademisë dhe fondet (sponsorizime, projekte, grante,
            donacione) — për {yearLabel}.{" "}
            <Link href="/admin/finance/overview">Arka e klubit</Link>
            {" · "}<Link href={invoicesHref}>Faturat e anëtarëve</Link>
          </div>
        </div>
        <NewFundButton sponsors={sponsors} />
      </div>

      {paid.truncated ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--err)", margin: "0 0 12px", lineHeight: 1.7 }}>
          Kujdes: janë lexuar vetëm {PAID_DUES_CAP} pagesat e fundit të anëtarësisë. Shifra e të hyrave nga
          akademia nuk e mbulon gjithë historikun.
        </div>
      ) : null}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 12 }}>
        <Kpi
          accent="#101828"
          label="Hyrjet gjithsej"
          value={formatEur(totalIncome)}
          sub={`anëtarësi ${formatEur(duesIncome)} + fonde ${formatEur(fundsIncome)} · ${yearLabel}`}
        />
        <Kpi
          accent="#0E9384"
          label="Nga akademia"
          value={formatEur(duesIncome)}
          sub={`${paymentCount(paidInYear.length)} kuotash të arkëtuara · ${yearLabel}`}
        />
        <Kpi
          accent="#16A34A"
          label="Nga fondet"
          value={formatEur(fundsIncome)}
          sub={`${fundCount(receivedInYear.length)} në llogari · ${yearLabel}`}
        />
        <Kpi
          accent="#E0562D"
          label="Premtuar por pa arritur"
          value={formatEur(pledgedTotal)}
          sub={`${fundCount(pledged.length)} · ${ALL_TIME_NOTE} · jashtë hyrjeve`}
        />
      </div>

      {/* The split, so the two sources are comparable at a glance without
          reading the ledger. Same window as everything above it. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Nga vjen — {yearLabel}</h3>
          <span className="kicker">para që kanë hyrë vërtet</span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Burimi</th>
                <th className="num">Shuma</th>
                <th className="num">Pjesa</th>
                <th>Detajet</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Kuotat e akademisë</td>
                <td className="num" data-lab="Shuma">{formatEur(duesIncome)}</td>
                <td className="num" data-lab="Pjesa">{split.dues}</td>
                <td data-lab="Detajet">
                  <Link href={invoicesHref}>Faturat e anëtarëve</Link>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Fondet e klubit</td>
                <td className="num" data-lab="Shuma">{formatEur(fundsIncome)}</td>
                <td className="num" data-lab="Pjesa">{split.funds}</td>
                <td data-lab="Detajet">Lista më poshtë</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Gjithsej</td>
                <td className="num" data-lab="Shuma" style={{ fontWeight: 600 }}>{formatEur(totalIncome)}</td>
                <td className="num" data-lab="Pjesa">{split.total}</td>
                <td data-lab="Detajet" style={{ color: "var(--text-3)" }}>hyn në bilancin e klubit</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.7, maxWidth: "84ch" }}>
          Kuotat numërohen sipas ditës kur PAGESA hyri, jo sipas muajit që faturojnë — pra një faturë e majit e
          paguar në gusht është e hyrë e gushtit. Është e njëjta shifër që shfaq{" "}
          <Link href="/admin/finance/overview">Arka e klubit</Link> për të njëjtën periudhë; faturat një nga një
          rrinë te <Link href={invoicesHref}>Faturat e anëtarëve</Link>, jo këtu.
          {year !== ALL && undatedPaid > 0 ? ` ${undatedPaidNote(undatedPaid)}` : ""}
        </p>
      </div>

      {/* The safety rail. It ignores the status filter AND the year on purpose:
          money that was promised and never arrived is the one thing on this
          screen that must not be possible to filter out of sight by accident,
          and a pledge made in 2025 is still open in 2026. */}
      {pledged.length > 0 ? (
        <div
          className="card"
          style={{ marginBottom: 16, borderColor: "color-mix(in oklab, var(--warn) 40%, transparent)", background: "var(--warn-bg)" }}
        >
          <div className="card-head" style={{ borderBottomColor: "color-mix(in oklab, var(--warn) 26%, transparent)" }}>
            <h3 style={{ color: "var(--warn)" }}>Premtuar por pa arritur</h3>
            <span className="kicker">{ALL_TIME_NOTE}</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
            {formatEur(pledgedTotal)} janë marrë vesh por nuk kanë hyrë ende në llogari. Kjo shumë nuk
            llogaritet si e hyrë në arkën e klubit dhe nuk mund të shpenzohet. Një premtim i hapur nuk i
            takon një viti, prandaj kjo listë i tregon të gjitha vitet edhe kur lart është zgjedhur një vit.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {pledged.map((f) => (
              <div
                key={f.id}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}
              >
                <span style={{ fontSize: 13.5, color: "var(--text-1)" }}>
                  {f.title}
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>
                    {f.sponsor_name ?? FUND_KIND_LABEL[f.kind]} · pritet {formatDate(f.occurred_on)}
                  </span>
                </span>
                <span className="mono" style={{ fontSize: 13, color: "var(--warn)", fontWeight: 600 }}>
                  {formatEur(f.amount_eur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card-head" style={{ marginBottom: 12 }}>
        <h3>Fondet e klubit</h3>
        <span className="kicker">
          {fundCount(rows.length)} · pranuar {formatEur(rowsReceived)}
          {rowsPledged > 0 ? ` · premtuar ${formatEur(rowsPledged)}` : ""} · {yearLabel}
        </span>
      </div>

      {/* Newest year first, "Të gjitha vitet" last — the default is this year. */}
      <div className="filter-bar">
        {years.map((y) => (
          <Link key={y} className={`chip ${year === y ? "active" : ""}`} href={link({ y })}>{y}</Link>
        ))}
        <Link className={`chip ${year === ALL ? "active" : ""}`} href={link({ y: ALL })}>{ALL_YEARS_LABEL}</Link>
        <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--line-strong)", margin: "2px 4px" }} />
        {STATUS_FILTERS.map((s) => (
          <Link key={s.value} className={`chip ${status === s.value ? "active" : ""}`} href={link({ st: s.value })}>
            {s.label}
          </Link>
        ))}
        <div className="spacer" />
        <Link className={`chip ${kind === ALL ? "active" : ""}`} href={link({ k: ALL })}>Të gjitha llojet</Link>
        {FUND_KINDS.map((k) => (
          <Link key={k} className={`chip ${kind === k ? "active" : ""}`} href={link({ k })}>{FUND_KIND_LABEL[k]}</Link>
        ))}
      </div>

      {all.length >= FUND_CAP ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 10px" }}>
          Shfaqen {FUND_CAP} hyrjet më të fundit. Zgjidh një vit për të parë të tjerat.
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Titulli</th>
              <th>Lloji</th>
              <th>Data</th>
              {/* Right-aligned in the header too, exactly like the cells. */}
              <th className="num">Shuma</th>
              <th>Statusi</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
                  {funds.length === 0
                    ? "Nuk ka asnjë fond të regjistruar. Këtu shkojnë sponsorizimet, projektet, grantet dhe donacionet — kuotat mujore të anëtarëve faturohen te Faturat dhe numërohen lart."
                    : `Asnjë fond nuk i përgjigjet këtij filtri për ${yearLabel}. Provo një vit ose një lloj tjetër.`}
                </td>
              </tr>
            ) : (
              rows.map((f) => (
                <FundRow key={f.id} fund={f} sponsors={sponsors} canDelete={canDelete} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12, lineHeight: 1.7 }}>
        Vetëm paratë e pranuara — kuotat e arkëtuara dhe fondet e mbërritura — hyjnë në bilancin te{" "}
        <Link href="/admin/finance/overview">Arka e klubit</Link>.
        {canDelete ? "" : " Fshirja e një hyrjeje bëhet vetëm nga admini — ti mund ta ndryshosh."}
      </p>
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
