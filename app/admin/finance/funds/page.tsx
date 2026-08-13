import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  FUND_KINDS, FUND_KIND_LABEL, FUND_STATUS_LABEL, formatDate, formatEur, sumEur,
} from "@/lib/finance";
import type { ClubFundKind, ClubFundStatus } from "@/lib/supabase/types";
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
  { value: "all", label: "Të gjitha" },
  { value: "received", label: FUND_STATUS_LABEL.received },
  { value: "pledged", label: FUND_STATUS_LABEL.pledged },
];

/** "3 hyrje". The noun does not inflect for number in this construction. */
function fundCount(n: number): string {
  return `${n} hyrje`;
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
  const [fundRes, sponsorRes] = await Promise.all([
    supabase
      .from("club_funds")
      .select("id, title, occurred_on, amount_eur, kind, sponsor_id, status, reference, notes")
      .order("occurred_on", { ascending: false })
      .limit(FUND_CAP),
    // Read separately and joined by hand below: the same list feeds the form's
    // sponsor picker, so one query serves both and no PostgREST embed is needed.
    supabase.from("sponsors").select("id, name, active").order("name", { ascending: true }).limit(SPONSOR_CAP),
  ]);

  if (fundRes.error || sponsorRes.error) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Hyrjet e klubit</h1>
            <div className="sub">Sponsorizime, projekte, grante dhe donacione.</div>
          </div>
        </div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--err)" }}>
            {dbError(fundRes.error ?? sponsorRes.error, "Leximi i hyrjeve dështoi.")}
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
    sponsor_name: f.sponsor_id ? sponsorName.get(f.sponsor_id) ?? "Sponsor i panjohur" : null,
  }));

  // ---- filters -------------------------------------------------------------
  const years = [...new Set(funds.map((f) => f.occurred_on.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const year = sp.y && years.includes(sp.y) ? sp.y : "all";
  const status = STATUS_FILTERS.some((s) => s.value === sp.st) ? sp.st! : "all";
  const kind = (FUND_KINDS as string[]).includes(sp.k ?? "") ? sp.k! : "all";
  const yearLabel = year === "all" ? "të gjitha vitet" : year;

  const inWindow = funds
    .filter((f) => year === "all" || f.occurred_on.slice(0, 4) === year)
    .filter((f) => kind === "all" || f.kind === kind);
  const rows = inWindow.filter((f) => status === "all" || f.status === status);

  // Totals describe the window, not the whole table, so the figures on screen
  // can never disagree with the list under them.
  const received = inWindow.filter((f) => f.status === "received");
  const pledged = inWindow.filter((f) => f.status === "pledged");
  const receivedTotal = sumEur(received);
  const pledgedTotal = sumEur(pledged);
  const pledgedSponsors = new Set(pledged.map((f) => f.sponsor_id).filter(Boolean)).size;

  const base = "/admin/finance/funds";
  const link = (over: { y?: string; st?: string; k?: string }) => {
    const params = new URLSearchParams();
    const y = over.y ?? year;
    const st = over.st ?? status;
    const k = over.k ?? kind;
    if (y !== "all") params.set("y", y);
    if (st !== "all") params.set("st", st);
    if (k !== "all") params.set("k", k);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hyrjet e klubit</h1>
          <div className="sub">
            Paratë që hyjnë pa qenë kuota anëtarësie: sponsorizime, projekte, grante dhe donacione.{" "}
            <Link href="/admin/finance/treasury">Arka e klubit</Link>
            {" · "}<Link href="/admin/finance">Faturat e anëtarëve</Link>
          </div>
        </div>
        <NewFundButton sponsors={sponsors} />
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 16 }}>
        <Kpi
          accent="#16A34A"
          label="Pranuar"
          value={formatEur(receivedTotal)}
          sub={`${fundCount(received.length)} në llogari · ${yearLabel}`}
        />
        <Kpi
          accent="#E0562D"
          label="Premtuar"
          value={formatEur(pledgedTotal)}
          sub={`${fundCount(pledged.length)} pa arritur · ${yearLabel}`}
        />
        <Kpi
          accent="#2E90FA"
          label="Sponsorë me premtim"
          value={String(pledgedSponsors)}
          sub={pledgedSponsors === 0 ? "asnjë premtim i hapur" : "presin transfertën"}
        />
      </div>

      {/* The safety rail. It ignores the status filter on purpose: money that
          was promised and never arrived is the one thing on this screen that
          must not be possible to filter out of sight by accident. */}
      {pledged.length > 0 ? (
        <div
          className="card"
          style={{ marginBottom: 16, borderColor: "color-mix(in oklab, var(--warn) 40%, transparent)", background: "var(--warn-bg)" }}
        >
          <div className="card-head" style={{ borderBottomColor: "color-mix(in oklab, var(--warn) 26%, transparent)" }}>
            <h3 style={{ color: "var(--warn)" }}>Premtuar por pa arritur</h3>
            <span className="kicker">{yearLabel}</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
            {formatEur(pledgedTotal)} janë marrë vesh por nuk kanë hyrë ende në llogari. Kjo shumë nuk
            llogaritet si e hyrë në arkën e klubit dhe nuk mund të shpenzohet.
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

      <div className="filter-bar">
        <Link className={`chip ${year === "all" ? "active" : ""}`} href={link({ y: "all" })}>Të gjitha vitet</Link>
        {years.map((y) => (
          <Link key={y} className={`chip ${year === y ? "active" : ""}`} href={link({ y })}>{y}</Link>
        ))}
        <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--line-strong)", margin: "2px 4px" }} />
        {STATUS_FILTERS.map((s) => (
          <Link key={s.value} className={`chip ${status === s.value ? "active" : ""}`} href={link({ st: s.value })}>
            {s.label}
          </Link>
        ))}
        <div className="spacer" />
        <Link className={`chip ${kind === "all" ? "active" : ""}`} href={link({ k: "all" })}>Të gjitha llojet</Link>
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
              <th>Shuma</th>
              <th>Statusi</th>
              <th>Veprime</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
                  {funds.length === 0
                    ? "Nuk ka asnjë hyrje të regjistruar. Këtu shkojnë sponsorizimet, projektet, grantet dhe donacionet — kuotat mujore të anëtarëve rrinë te Faturat."
                    : "Asnjë hyrje nuk i përgjigjet këtij filtri. Provo një vit ose një lloj tjetër."}
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
        Vetëm paratë e pranuara hyjnë në bilancin te <Link href="/admin/finance/treasury">Arka e klubit</Link>.
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
