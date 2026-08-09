import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import {
  BILLING_MODE_LABEL, EFFECTIVE_STATUS_LABEL, EFFECTIVE_STATUS_TONE,
  MEMBERSHIP_STATUS_LABEL, PAID_METHOD_LABEL,
  billingMode, daysOverdue, dueDateOf, effectiveStatus, formatDate, formatEur,
  isOutstanding, outstandingTotal, periodLabel, planAmountLabel, sumEur,
  type BillingMode, type DueLike, type EffectiveDuesStatus,
} from "@/lib/finance";
import type { DuesStatus, MembershipStatus, PaidMethod } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Anëtarësia & faturat" };

// A member has one invoice a month, so this covers twenty years of history and
// only exists so a corrupted account can never render an unbounded list.
const DUES_CAP = 240;

const CARD = {
  background: "var(--white, #fff)",
  border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 8px 24px rgba(15,26,46,.05)",
} as const;

const MONO = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  lineHeight: 1.65,
  color: "var(--ink-3)",
} as const;

// Same three accents the admin finance KPIs use, so a member and the staff
// member on the phone next to them are looking at the same colour language.
const TONE_COLOR: Record<"ok" | "warn" | "err", string> = {
  ok: "#16A34A",
  warn: "#B54708",
  err: "#B42318",
};

// ------------------------------------------------------------------ data

type MembershipRow = {
  id: string;
  plan_id: string;
  amount_eur: number;
  billable: boolean;
  start_date: string;
  end_date: string | null;
  status: MembershipStatus;
};

type PlanRow = {
  id: string;
  name_sq: string;
};

type DueRow = {
  id: string;
  period: string;
  due_date: string | null;
  amount_eur: number;
  status: DuesStatus;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  invoice_no: string | null;
  membership_id: string | null;
};

/** "1 faturë" / "3 fatura" — a bare count reads wrong in the singular. */
function invoiceCount(n: number): string {
  return `${n} ${n === 1 ? "faturë" : "fatura"}`;
}

/**
 * dueDateOf(), not due_date: legacy rows have no stored deadline, and the
 * status badge is derived from period + 14 days, so the date printed next to
 * it has to be the same one or the two contradict each other.
 */
function dueLabel(due: DueLike): string {
  const d = dueDateOf(due);
  return d ? d.toLocaleDateString("sq") : "pa afat";
}

/** Never print "Invalid Date" if the stored timestamp is unparseable. */
function paidAtLabel(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sq");
}

export default async function PortalMembershipPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // Three selects, in parallel, for the whole page. The joins are two Maps below.
  // No active=true filter here on purpose: RLS decides what comes back, and
  // membership_plans_select_own_membership (migration 20260809000001) returns the
  // retired tiers this member was actually enrolled on, so an archived plan still
  // resolves to the same name staff see in /admin/finance. The "Plan i arkivuar"
  // fallback below is now only reachable if the plan row itself is gone.
  const [membershipRes, duesRes, planRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, plan_id, amount_eur, billable, start_date, end_date, status")
      .eq("member_id", profile.id)
      .order("start_date", { ascending: false })
      .limit(50),
    supabase
      .from("dues")
      .select("id, period, due_date, amount_eur, status, paid_at, paid_method, invoice_no, membership_id")
      .eq("member_id", profile.id)
      .order("period", { ascending: false })
      .limit(DUES_CAP),
    supabase
      .from("membership_plans")
      .select("id, name_sq")
      .order("display_order", { ascending: true }),
  ]);

  // Half a money page is worse than none: "nuk ke borxh" printed because a
  // select failed is a lie the member would act on.
  const loadError = membershipRes.error ?? duesRes.error ?? planRes.error;
  if (loadError) {
    return (
      <>
        <PageHead />
        <div style={{ ...CARD, marginTop: 22 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--err, #c24a4a)" }}>
            {dbError(loadError, "Leximi i të dhënave të anëtarësisë dështoi.")}
          </p>
          <p style={{ ...MONO, margin: "8px 0 0" }}>
            Gjendja nuk shfaqet me shifra të paplota. Rifresko faqen dhe, nëse përsëritet, njofto klubin.
          </p>
        </div>
      </>
    );
  }

  const memberships = (membershipRes.data as MembershipRow[] | null) ?? [];
  const dues = (duesRes.data as DueRow[] | null) ?? [];
  const plans = (planRes.data as PlanRow[] | null) ?? [];

  const planById = new Map(plans.map((p) => [p.id, p]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));

  /** The plan an invoice was billed under, or null when it cannot be resolved. */
  function planOfDue(d: DueRow): string | null {
    const m = d.membership_id ? membershipById.get(d.membership_id) ?? null : null;
    return m ? planName(m) : null;
  }

  function planName(m: MembershipRow | null): string {
    if (!m) return "Plan i panjohur";
    // A tier the club has retired is no longer readable to the member, so the
    // name legitimately comes back missing — say that instead of "undefined".
    return planById.get(m.plan_id)?.name_sq ?? "Plan i arkivuar";
  }

  // The membership in force today. Rows arrive newest first, so the first
  // 'active' row is the current one; if none is active the newest row is still
  // the truth ("e mbyllur" / "e pezulluar" is a real answer, not an empty one).
  const current = memberships.find((m) => m.status === "active") ?? memberships[0] ?? null;
  const mode: BillingMode | null = current ? billingMode(current) : null;
  // Only an 'active' row is ever invoiced: generate_dues_for_period_internal
  // skips 'paused' outright and an 'ended' row stops at its end_date. Promising
  // "fatura e muajit shfaqet më poshtë" to a paused member is a lie the club
  // would then have to explain.
  const inForce = current?.status === "active";

  // ---- money summary -------------------------------------------------------
  const open = dues.filter(isOutstanding);
  const openSorted = [...open].sort((a, b) => a.period.localeCompare(b.period));
  const oldestOpen = openSorted[0] ?? null;
  const oldestLate = oldestOpen ? daysOverdue(oldestOpen) : 0;
  // The next thing they actually have to pay: the earliest still-open invoice
  // whose deadline has not passed. When every open invoice is already late
  // there is no "next" — the sentence below says so rather than showing a tile.
  const nextDue = openSorted.find((d) => effectiveStatus(d) === "unpaid") ?? null;
  const outstanding = outstandingTotal(dues);
  const paidRows = dues.filter((d) => effectiveStatus(d) === "paid");
  const waivedRows = dues.filter((d) => effectiveStatus(d) === "waived");
  // The most recent PAYMENT, which is not the most recent period: a member
  // catching up pays an old month today.
  const lastPaidAt = paidRows
    .map((d) => paidAtLabel(d.paid_at) && d.paid_at)
    .filter((v): v is string => typeof v === "string")
    .sort()
    .pop() ?? null;

  // Copy for the "you owe nothing" card. A zero here means four different
  // things, and only one of them is "you paid", so each gets its own sentence.
  let clearTitle: string;
  let clearBody: string;
  if (mode === "non_billable") {
    clearTitle = "Nuk ke asnjë detyrim ndaj klubit.";
    // A racer promoted from an academy tier keeps the invoices of that tier, so
    // "nuk do të shfaqet kurrë një shumë" would be contradicted by the list
    // right below it.
    clearBody = dues.length === 0
      ? "Si garues nuk faturohesh fare, prandaj këtu nuk do të shfaqet asnjë shumë për të paguar."
      : "Si garues nuk faturohesh më. Faturat më poshtë janë nga një periudhë e mëparshme dhe janë të mbyllura.";
  } else if (dues.length === 0) {
    clearTitle = "Nuk ke asnjë faturë të hapur.";
    clearBody = mode === "waived"
      ? "Anëtarësia jote është e falur, prandaj nuk pritet asnjë faturë mujore."
      : inForce
        ? "Ende nuk të është lëshuar asnjë faturë. Sapo klubi t’i gjenerojë faturat e muajit, do t’i shohësh këtu."
        : current
          ? "Nuk të është lëshuar asnjë faturë dhe, me anëtarësinë në këtë gjendje, klubi nuk lëshon fatura të reja."
          : "Ende nuk të është lëshuar asnjë faturë, sepse anëtarësia jote nuk është regjistruar ende.";
  } else if (paidRows.length === 0) {
    clearTitle = "Nuk ke asgjë për të paguar.";
    // Every invoice waived is the ordinary case here; anything else (e.g. an
    // open invoice with no amount on it) must not be reported as a favour.
    clearBody = waivedRows.length === dues.length
      ? `Të gjitha faturat e tua (${invoiceCount(dues.length)}) janë falur nga klubi.`
      : "Asnjë nga faturat e tua nuk kërkon pagesë për momentin.";
  } else {
    clearTitle = "Je në rregull me pagesat.";
    clearBody = `${invoiceCount(paidRows.length)} të paguara · ${formatEur(sumEur(paidRows))} gjithsej${
      lastPaidAt ? ` · pagesa e fundit më ${paidAtLabel(lastPaidAt)}` : ""
    }.`;
  }

  return (
    <>
      <PageHead />

      {/* ---------------------------------------------------- 1) ANËTARËSIA */}
      <Section title="Anëtarësia" />
      {!current ? (
        <div style={CARD}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>
            Nuk ke ende një anëtarësi të regjistruar.
          </p>
          <p style={{ ...MONO, margin: "8px 0 0" }}>
            Kjo do të thotë që klubi nuk të ka caktuar ende një plan anëtarësie, prandaj nuk paguan
            asgjë për momentin. Fol me trajnerin ose me zyrën e klubit për ta rregulluar.
          </p>
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.15 }}>
                {planName(current)}
              </div>
              <div style={{ ...MONO, marginTop: 4, fontSize: 13, color: "var(--ink-3)" }}>
                {/* planAmountLabel() would render a waived membership as
                    "€0.00 / muaj", which reads like a broken price rather than
                    a favour the club granted. */}
                {mode === "waived" ? "E falur — pa pagesë mujore" : planAmountLabel(current)}
              </div>
            </div>
            <Badge tone={current.status === "active" ? "ok" : "warn"} label={MEMBERSHIP_STATUS_LABEL[current.status]} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <Pill label="Që nga" value={formatDate(current.start_date)} />
            {current.end_date ? <Pill label="Deri më" value={formatDate(current.end_date)} /> : null}
            {mode ? <Pill label="Faturimi" value={BILLING_MODE_LABEL[mode]} /> : null}
          </div>

          <p style={{ ...MONO, margin: "14px 0 0" }}>
            {mode === "non_billable"
              ? `Si garues i klubit nuk paguan anëtarësi mujore dhe nuk të lëshohet asnjë faturë e re. Kjo nuk është një borxh i shlyer — ti thjesht je jashtë faturimit.${
                  dues.length > 0 ? " Faturat më poshtë janë nga një plan i mëparshëm." : ""
                }`
              : mode === "waived"
                ? "Je në një plan me pagesë, por klubi ta ka falur shumën mujore, prandaj nuk ke asgjë për të paguar. Kjo është një lehtësim i miratuar për ty dhe mund të ndryshojë nëse klubi e rishikon."
                : current.status === "paused"
                  ? `Anëtarësia jote është e pezulluar, prandaj klubi nuk të lëshon fatura të reja derisa ta rikthejë. Kur të rikthehet, faturimi vazhdon me ${formatEur(current.amount_eur)} në muaj.`
                  : current.status === "ended"
                    ? `Kjo anëtarësi është mbyllur${current.end_date ? ` më ${formatDate(current.end_date)}` : ""}, prandaj nuk të lëshohet më asnjë faturë. Fol me klubin nëse do ta rifillosh.`
                    : `Anëtarësia jote faturohet çdo muaj me ${formatEur(current.amount_eur)}. Fatura e muajit shfaqet më poshtë sapo klubi ta lëshojë.`}
          </p>
        </div>
      )}

      {/* -------------------------------------------------------- 2) GJENDJA */}
      <Section title="Gjendja" />
      {outstanding > 0 ? (
        <div style={CARD}>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <Stat label="Për të paguar" value={formatEur(outstanding)} tone={oldestLate > 0 ? "err" : "warn"} />
            <Stat label="Fatura të hapura" value={invoiceCount(open.length)} />
            {oldestOpen ? (
              <Stat
                label="Më e vjetra"
                value={periodLabel(oldestOpen.period)}
                sub={oldestLate > 0 ? `${oldestLate} ditë vonesë` : `afati më ${dueLabel(oldestOpen)}`}
                tone={oldestLate > 0 ? "err" : undefined}
              />
            ) : null}
            {nextDue ? (
              <Stat label="Pagesa e radhës" value={formatEur(nextDue.amount_eur)} sub={`deri më ${dueLabel(nextDue)}`} />
            ) : null}
          </div>
          <p style={{ ...MONO, margin: "14px 0 0" }}>
            {!nextDue
              ? "Të gjitha faturat e hapura e kanë kaluar afatin e pagesës. Paguaji te klubi sa më parë ose fol me zyrën për një marrëveshje."
              : oldestLate > 0
                ? "Ke fatura që e kanë kaluar afatin. Pagesat kryhen te klubi — paguaj në zyrë ose me transfer bankar dhe klubi e shënon faturën si të paguar."
                : "Pagesat kryhen te klubi. Kjo faqe përditësohet sapo klubi ta regjistrojë pagesën tënde."}{" "}
            Për çdo paqartësi shkruaj në{" "}
            <a href="mailto:info@prishtina038.cc?subject=Anëtarësia" style={{ color: "var(--ember)", textDecoration: "underline" }}>
              info@prishtina038.cc
            </a>.
          </p>
        </div>
      ) : (
        <div style={CARD}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>{clearTitle}</p>
          <p style={{ ...MONO, margin: "8px 0 0" }}>{clearBody}</p>
          {waivedRows.length > 0 && paidRows.length > 0 ? (
            <p style={{ ...MONO, margin: "6px 0 0" }}>
              {invoiceCount(waivedRows.length)} të falura nga klubi nuk kërkojnë pagesë.
            </p>
          ) : null}
        </div>
      )}

      {/* -------------------------------------------------------- 3) FATURAT */}
      <Section title="Faturat" sub={dues.length > 0 ? `${invoiceCount(dues.length)} · më e reja së pari` : undefined} />
      {dues.length === 0 ? (
        <div style={CARD}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>Nuk ke asnjë faturë.</p>
          <p style={{ ...MONO, margin: "8px 0 0" }}>
            {mode === "non_billable"
              ? "Garuesit nuk faturohen, prandaj kjo listë do të mbetet bosh. Nuk ka asgjë për të rregulluar."
              : mode === "waived"
                ? "Anëtarësia jote është e falur, prandaj klubi nuk të lëshon fatura mujore."
                : inForce
                  ? "Klubi nuk ka lëshuar ende asnjë faturë për ty. Faturat gjenerohen në fillim të çdo muaji."
                  : current
                    ? "Nuk ka asnjë faturë të regjistruar për ty dhe, me anëtarësinë në këtë gjendje, klubi nuk lëshon fatura të reja."
                    : "Sapo klubi të regjistrojë anëtarësinë tënde, faturat mujore do të shfaqen këtu."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {dues.map((d) => (
            <InvoiceCard key={d.id} due={d} plan={planOfDue(d)} />
          ))}
          {dues.length >= DUES_CAP ? (
            <p style={{ ...MONO, margin: "2px 0 0" }}>
              Shfaqen {DUES_CAP} faturat e fundit. Për fatura më të vjetra kërko te zyra e klubit.
            </p>
          ) : null}
        </div>
      )}

      {/* ------------------------------------------ 4) HISTORIKU I ANËTARËSISË */}
      {memberships.length > 1 ? (
        <>
          <Section title="Historiku i anëtarësisë" sub="Planet nëpër të cilat ke kaluar" />
          <div style={{ display: "grid", gap: 10 }}>
            {memberships.map((m) => {
              const mMode = billingMode(m);
              return (
                <div key={m.id} style={{ ...CARD, padding: "15px 17px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <strong style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700, letterSpacing: "-.012em" }}>
                      {planName(m)}
                    </strong>
                    <Badge tone={m.status === "active" ? "ok" : "warn"} label={MEMBERSHIP_STATUS_LABEL[m.status]} />
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
                    <Pill
                      label="Periudha"
                      value={`${formatDate(m.start_date)} – ${m.end_date ? formatDate(m.end_date) : "vazhdon"}`}
                    />
                    <Pill label="Mujore" value={mMode === "billed" ? formatEur(m.amount_eur) : BILLING_MODE_LABEL[mMode]} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ pieces

function PageHead() {
  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, letterSpacing: "-0.03em", margin: 0 }}>
        Anëtarësia & faturat
      </h1>
      <div className="sub" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".06em", color: "var(--ink-3)" }}>
        Plani yt, gjendja e pagesave dhe faturat mujore.
      </div>
    </>
  );
}

function Section({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ margin: "26px 0 12px" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.015em", margin: 0 }}>
        {title}
      </h2>
      {sub ? (
        <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", color: "var(--ink-3)", marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function InvoiceCard({ due, plan }: { due: DueRow; plan: string | null }) {
  const status: EffectiveDuesStatus = effectiveStatus(due);
  const tone = EFFECTIVE_STATUS_TONE[status];
  const late = daysOverdue(due);
  const paid = paidAtLabel(due.paid_at);

  return (
    <div style={{ ...CARD, padding: "15px 17px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700, letterSpacing: "-.012em", lineHeight: 1.2 }}>
          {periodLabel(due.period)}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>
            {formatEur(due.amount_eur)}
          </span>
        </strong>
        <Badge tone={tone} label={EFFECTIVE_STATUS_LABEL[status]} />
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
        <Pill label="Fatura" value={due.invoice_no ?? "pa numër"} />
        {status === "paid" || status === "waived" ? null : <Pill label="Afati" value={dueLabel(due)} />}
        {plan ? <Pill label="Plani" value={plan} /> : null}
        {status === "paid" ? (
          <>
            <Pill label="Paguar më" value={paid ?? "datë e pashënuar"} />
            <Pill label="Mënyra" value={due.paid_method ? PAID_METHOD_LABEL[due.paid_method] : "e pashënuar"} />
          </>
        ) : null}
      </div>

      {status === "overdue" ? (
        <p style={{ ...MONO, margin: "10px 0 0", color: TONE_COLOR.err }}>
          Afati skadoi më {dueLabel(due)} — {late} ditë vonesë. Kjo faturë pritet të paguhet te klubi.
        </p>
      ) : null}
      {status === "waived" ? (
        <p style={{ ...MONO, margin: "10px 0 0" }}>
          Klubi e ka falur këtë faturë — nuk ke asgjë për të paguar për këtë muaj dhe nuk numërohet as si borxh, as si pagesë.
        </p>
      ) : null}
      {due.membership_id === null ? (
        <p style={{ ...MONO, margin: "10px 0 0" }}>
          Faturë e regjistruar para se planet e anëtarësisë të hynin në sistem, prandaj nuk ka plan të lidhur.
        </p>
      ) : null}

      {/* The printable document. New tab, so the member does not lose this
          list; /invoice/[id] is chrome-free on purpose and prints as a sheet. */}
      <p style={{ ...MONO, margin: "12px 0 0" }}>
        <a
          href={`/invoice/${due.id}`}
          target="_blank"
          rel="noopener"
          style={{ color: "var(--ember)", textDecoration: "underline" }}
        >
          {status === "paid" ? "Shiko dhe printo vërtetimin ↗" : "Shiko dhe printo faturën ↗"}
        </a>
      </p>
    </div>
  );
}

function Badge({ tone, label }: { tone: "ok" | "warn" | "err"; label: string }) {
  const c = TONE_COLOR[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: `color-mix(in oklab, ${c} 12%, #fff)`,
        border: `1px solid color-mix(in oklab, ${c} 30%, transparent)`,
        color: c,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "err" }) {
  return (
    <div>
      <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2, color: tone ? TONE_COLOR[tone] : undefined }}>
        {value}
      </div>
      {sub ? (
        <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "5px 11px", borderRadius: 999, background: "color-mix(in oklab, var(--ink, #0f1a2e) 4%, #fff)", border: "1px solid color-mix(in oklab, var(--ink, #0f1a2e) 8%, transparent)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
      <span style={{ color: "var(--ink-3, #2a3858)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</span>
      <b style={{ fontWeight: 700, color: "var(--ink, #0f1a2e)", fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>{value}</b>
    </span>
  );
}
