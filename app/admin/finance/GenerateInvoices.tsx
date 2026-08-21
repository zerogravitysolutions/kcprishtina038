"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/errors";
import { BILLING_MODE_LABEL, formatDate, periodLabel, periodOf } from "@/lib/finance";
import { Modal } from "@/components/ui/Modal";
import { eligibleMembersForPeriod, generateInvoicesForMembers } from "./actions";
import type { Eligibility, EligibilityResult, EligibleMember } from "./actions";

const LOAD_FAILED = "Leximi i anëtarëve për faturim dështoi. Provo sërish.";

/** One shared empty list, so "nobody" has a stable identity across renders. */
const NO_MEMBERS: EligibleMember[] = [];

/**
 * Opens a modal that asks for the INVOICE DATE and a multiselect of the members
 * to bill — instead of silently billing everyone. The RPC is idempotent
 * (unique(member_id, period)), so the copy says outright that a second press
 * bills no one twice.
 *
 * The rule that makes this screen honest: THE INVOICE DATE DECIDES THE MONTH,
 * and the member list follows it. The date used to be a free-text field over a
 * roster computed for the page's month, so picking 15 July on the August page
 * billed a July period from an August list and created nothing, with no
 * explanation. Now every change of month refetches the roster from the same
 * server pick the generator itself makes.
 */
export function GenerateInvoices({
  period, label, nowPeriod, initial,
}: {
  /** The month the PAGE is showing, first-of-month. The initial invoice date. */
  period: string;
  label: string;
  /** First of the current month, from the SERVER clock — so the future/past
   * verdict is the same one the server action will reach, and so the first
   * render cannot disagree with hydration on a browser in another timezone. */
  nowPeriod: string;
  /** Who would be billed for `period`, or why nobody would — server-rendered,
   * so the modal paints its real list before any client fetch. */
  initial: EligibilityResult;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // The invoice date. Defaults to the first day of the shown month; editable,
  // and its MONTH is what everything below is about.
  const [issuedOn, setIssuedOn] = useState(period);
  // The roster currently on screen, and the month it belongs to. Kept together
  // in one state so the list can never be painted under the wrong month.
  const [state, setState] = useState<{ period: string; result: EligibilityResult }>(
    { period, result: initial },
  );
  const [loadingPeriod, setLoadingPeriod] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() => initialIds(initial));
  const [search, setSearch] = useState("");

  // Which fetch is the current one: a slow answer for an abandoned month must
  // never overwrite a fast answer for the month now on screen.
  const seqRef = useRef(0);
  // The last month we asked the server about, so the effect does not re-fire
  // while its own request is in flight.
  const requestedRef = useRef(period);
  // Reset happens on the CLOSED → OPEN transition only. It used to run whenever
  // the `members` prop got a new identity, which router.refresh() hands down
  // after every successful run — wiping "U krijuan N fatura" off the screen the
  // instant it appeared.
  const wasOpenRef = useRef(false);

  const load = useCallback((target: string) => {
    const seq = ++seqRef.current;
    requestedRef.current = target;
    setLoadingPeriod(target);
    eligibleMembersForPeriod(target)
      .then((result) => {
        if (seqRef.current !== seq) return;
        setLoadingPeriod(null);
        setState({ period: target, result });
        setSelected(initialIds(result));
      })
      .catch((e) => {
        if (seqRef.current !== seq) return;
        setLoadingPeriod(null);
        setState({ period: target, result: { ok: false, error: actionError(e, LOAD_FAILED) ?? LOAD_FAILED } });
        setSelected([]);
      });
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Fresh panel: the page's month, its server-rendered roster, nothing else.
      seqRef.current++;
      requestedRef.current = period;
      setLoadingPeriod(null);
      setIssuedOn(period);
      setState({ period, result: initial });
      setSelected(initialIds(initial));
      setSearch("");
      setMsg(null);
    }
    wasOpenRef.current = open;
  }, [open, period, initial]);

  const datePeriod = useMemo(() => monthStartOf(issuedOn), [issuedOn]);

  // The date moved to another month → fetch that month's roster.
  useEffect(() => {
    if (!open || !datePeriod) return;
    if (datePeriod === state.period) {
      // Back on the month already on screen. Cancel anything still in flight,
      // or a slow answer for the month just abandoned would land on top of it.
      seqRef.current++;
      requestedRef.current = datePeriod;
      setLoadingPeriod(null);
      return;
    }
    if (requestedRef.current === datePeriod) return;
    load(datePeriod);
  }, [open, datePeriod, state.period, load]);

  const dueLabel = useMemo(() => dueDateLabel(issuedOn), [issuedOn]);
  const invalidDate = !dueLabel || !datePeriod;

  // Where the CHOSEN month sits relative to today — not the page's month. A
  // future month can never be generated: the invoices would freeze today's
  // price into a month that has not begun and can only be waived, never deleted.
  const dateWhen = !datePeriod ? null
    : datePeriod > nowPeriod ? "future" : datePeriod === nowPeriod ? "current" : "past";

  // The roster in `state` is authoritative only while it matches the date.
  const inSync = !!datePeriod && state.period === datePeriod;
  const loading = loadingPeriod !== null;
  const data = state.result.ok ? state.result.data : null;
  const loadError = state.result.ok ? null : state.result.error;
  // Memoised so an empty list keeps its identity: a fresh [] every render would
  // re-run the search filter (and every effect keyed on it) forever.
  const members = useMemo(() => (inSync && data ? data.members : NO_MEMBERS), [inSync, data]);
  const activePeriod = datePeriod ?? period;
  const activeLabel = periodLabel(activePeriod);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? members.filter((m) => m.full_name.toLowerCase().includes(q)) : members;
  }, [members, search]);

  const selectedSet = new Set(selected);

  function toggle(id: string) {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function created(n: number): string {
    if (n === 0) return "Nuk u krijua asnjë faturë e re: ose ekzistojnë tashmë, ose asnjë nga anëtarët e zgjedhur nuk faturohet për këtë muaj.";
    if (n === 1) return "U krijua 1 faturë.";
    return `U krijuan ${n} fatura.`;
  }

  function run() {
    if (!datePeriod) return;
    const target = datePeriod;
    setMsg(null);
    start(async () => {
      try {
        const r = await generateInvoicesForMembers(selected, issuedOn, target);
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setMsg({ ok: true, text: created(r.created) });
        // Refresh the page behind the modal AND this list, so the roster stops
        // offering the members that were just billed — while the confirmation
        // above stays exactly where the eye left it.
        router.refresh();
        load(target);
      } catch (e) {
        const text = actionError(e, "Gjenerimi i faturave dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  // A future PAGE month has no button at all — but it does say who is waiting,
  // which is the one thing the owner needed to read.
  if (period > nowPeriod) {
    const preview = state.result.ok ? state.result.data : null;
    return (
      <div style={{ textAlign: "right", maxWidth: 280 }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7 }}>
          {label} nuk ka filluar ende. Faturat gjenerohen brenda muajit.
        </div>
        {loadError ? (
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--err)", lineHeight: 1.7, marginTop: 6 }}>
            {loadError}
          </div>
        ) : preview && preview.members.length > 0 ? (
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7, marginTop: 6 }}>
            {preview.members.length === 1
              ? `1 anëtar faturohet më ${formatDate(period)}.`
              : `${preview.members.length} anëtarë faturohen më ${formatDate(period)}.`}
          </div>
        ) : preview && preview.alreadyBilled > 0 ? (
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7, marginTop: 6 }}>
            {preview.alreadyBilled === 1
              ? "1 anëtar e ka faturën e këtij muaji tashmë."
              : `${preview.alreadyBilled} anëtarë e kanë faturën e këtij muaji tashmë.`}
          </div>
        ) : null}
      </div>
    );
  }

  const noneSelected = selected.length === 0;
  const blocked = loading || !inSync || !!loadError || dateWhen === "future";

  return (
    <div style={{ textAlign: "right" }}>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>
        Gjenero faturat për {label}
      </button>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", marginTop: 8 }}>
        Mund ta shtypësh disa herë — fatura e dyfishtë nuk krijohet.
      </div>
      {loadError ? (
        // Visible WITHOUT opening the modal: a read that failed must not wait
        // behind a click to be admitted.
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--err)", marginTop: 6, lineHeight: 1.7, maxWidth: 280, marginLeft: "auto" }}>
          {loadError}
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title={`Gjenero faturat për ${activeLabel}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember"
              onClick={run}
              disabled={pending || noneSelected || invalidDate || blocked}
            >
              {pending ? "Duke gjeneruar…" : `Gjenero (${selected.length})`}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16, textAlign: "left" }}>
          {/* 1) Invoice date + resulting due date. The date owns the month. */}
          <div>
            <label className="mono" style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
              DATA E FATURËS
            </label>
            <input
              type="date"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
              style={{ width: "100%", maxWidth: 220 }}
            />
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
              {dueLabel ? `Afati i pagesës: ${dueLabel}` : "Data nuk është e vlefshme."}
            </div>
            {!invalidDate ? (
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                Muaji i faturimit: {activeLabel}
                {activePeriod !== period ? " — ndryshoi bashkë me datën" : ""}
              </div>
            ) : null}
            {dateWhen === "future" ? (
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--warn)", marginTop: 6, lineHeight: 1.7 }}>
                {activeLabel} nuk ka filluar ende — faturat gjenerohen brenda muajit. Zgjidh një datë të këtij muaji ose më herët.
              </div>
            ) : null}
            {dateWhen === "past" && !invalidDate ? (
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--warn)", marginTop: 6, lineHeight: 1.7 }}>
                Kujdes: {activeLabel} ka kaluar — këto fatura krijohen menjëherë në vonesë dhe nuk fshihen dot.
              </div>
            ) : null}
          </div>

          {/* 2) The members to bill — default all selected, deselect to exclude. */}
          <div>
            <label className="mono" style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
              ANËTARËT E AKADEMISË
            </label>

            {invalidDate ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: "10px 0" }}>
                Zgjidh një datë të vlefshme fature për të parë anëtarët e atij muaji.
              </div>
            ) : loading || !inSync ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: "10px 0" }}>
                Duke lexuar anëtarët për {activeLabel}…
              </div>
            ) : loadError ? (
              // An empty list that MEANS "the read failed" is indistinguishable
              // from "nobody qualifies". It never gets to look like one again.
              <div style={{ border: "1px solid var(--err)", borderRadius: 10, padding: 12, background: "var(--white)" }}>
                <div style={{ fontSize: 13, color: "var(--err)" }}>{loadError}</div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => load(activePeriod)}
                >
                  Provo sërish
                </button>
              </div>
            ) : members.length === 0 && data ? (
              <EmptyReason data={data} onPickMonth={(p) => setIssuedOn(p)} nowPeriod={nowPeriod} />
            ) : (
              <div style={{ border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--white)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
                  <input
                    type="search"
                    aria-label="Kërko anëtar"
                    placeholder="Kërko anëtar…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="athlete-search"
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(members.map((m) => m.member_id))}>
                    Zgjidh të gjithë
                  </button>
                  {selected.length > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Pastro</button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, maxHeight: 260, overflowY: "auto" }}>
                  {filtered.length === 0 ? (
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: 8 }}>Asnjë anëtar.</div>
                  ) : (
                    filtered.map((m) => {
                      const on = selectedSet.has(m.member_id);
                      return (
                        <button
                          key={m.member_id}
                          type="button"
                          className="athlete-chip"
                          onClick={() => toggle(m.member_id)}
                          aria-pressed={on}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 8,
                            padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13,
                            border: `1px solid ${on ? "var(--ember)" : "var(--line-strong)"}`,
                            background: on ? "color-mix(in oklab, var(--ember) 12%, var(--white))" : "var(--white)",
                            color: "var(--ink)", minHeight: 36,
                          }}
                        >
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${on ? "var(--ember)" : "var(--slate)"}`,
                            background: on ? "var(--ember)" : "transparent",
                            display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11,
                          }}>{on ? "✓" : ""}</span>
                          <span>
                            {m.full_name}
                            {m.plan_name ? <span style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: 11 }}>{m.plan_name}</span> : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 10px", borderTop: "1px solid var(--line)", letterSpacing: ".08em" }}>
                  {selected.length} të zgjedhur nga {members.length} · {activeLabel}
                  {data && data.alreadyBilled > 0 ? ` · ${data.alreadyBilled} e kanë faturën tashmë` : ""}
                </div>
              </div>
            )}
          </div>

          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7 }}>
            Mund ta shtypësh disa herë — fatura e dyfishtë nuk krijohet.
          </div>

          {msg ? <div className={`mm-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
        </div>
      </Modal>
    </div>
  );
}

/**
 * WHY there is nobody to bill, in one specific sentence plus the way out.
 * The old copy offered two guesses ("ose të gjithë e kanë faturën tashmë, ose
 * asnjë anëtarësi me pagesë nuk është aktive") and both were false in the case
 * that actually happened: an active €40 membership existed, it simply started
 * the following month. `data` carries server-side counts, so this decides
 * nothing — it only reads out what was counted.
 */
function EmptyReason({
  data, nowPeriod, onPickMonth,
}: {
  data: Eligibility;
  nowPeriod: string;
  /** Jump the invoice date to another month, which refetches the roster. */
  onPickMonth: (period: string) => void;
}) {
  const label = periodLabel(data.period);
  const box = {
    border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--white)",
    padding: 12, display: "grid", gap: 8,
  } as const;
  const head = { margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.6 } as const;
  const note = { margin: 0, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.7 } as const;

  if (data.reason === "no_memberships") {
    return (
      <div style={box}>
        <p style={head}>Asnjë anëtar nuk ka anëtarësi të regjistruar, prandaj nuk ka çfarë të faturohet për {label}.</p>
        <p style={note}>
          Anëtarësia krijohet kur pranon një aplikim ose kur ia cakton planin një personi. Llogaria vetëm si përdorues nuk faturohet.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-sm" href="/admin/applications">Hap aplikimet</Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/people">Shko te njerëzit</Link>
        </div>
      </div>
    );
  }

  if (data.reason === "all_billed") {
    return (
      <div style={box}>
        <p style={head}>
          {/* "faturën PËR Gusht 2026", not "faturën e Gusht 2026": periodLabel
              returns the nominative ("Gusht 2026"), and the genitive the "e"
              asks for would have to read "e gushtit 2026". */}
          {data.billableCount === 1
            ? `I vetmi anëtar me pagesë e ka faturën për ${label} tashmë.`
            : `Të ${data.billableCount} anëtarët me pagesë e kanë faturën për ${label} tashmë.`}
        </p>
        <p style={note}>Nuk ka çfarë të krijohet për këtë muaj. Faturat e krijuara i sheh në listën pas kësaj dritareje.</p>
      </div>
    );
  }

  if (data.reason === "none_billable") {
    return (
      <div style={box}>
        <p style={head}>
          Anëtarësitë në fuqi për {label} nuk faturohen
          {data.nonBillableTotal === 1 ? "" : ` (${data.nonBillableTotal} gjithsej)`}.
        </p>
        <ul style={{ ...note, paddingLeft: 18, display: "grid", gap: 2 }}>
          {data.nonBillable.map((m) => (
            <li key={m.member_id}>{m.full_name} — {BILLING_MODE_LABEL[m.mode].toLowerCase()}</li>
          ))}
          {data.nonBillableTotal > data.nonBillable.length ? (
            <li>+{data.nonBillableTotal - data.nonBillable.length} të tjerë</li>
          ) : null}
        </ul>
        <p style={note}>
          Garuesit nuk faturohen fare, kurse një plan me shumë 0 nuk prodhon faturë. Ndrysho planin ose shumën te <Link href="/admin/people">njerëzit</Link>.
        </p>
      </div>
    );
  }

  // none_covering — memberships exist, none is in force for this month. This is
  // the case the old copy could not say, and the one production was actually in.
  return (
    <div style={box}>
      <p style={head}>
        Për {label} asnjë anëtarësi nuk është në fuqi — u kontrolluan {data.totalMemberships} anëtarësi.
      </p>
      {data.upcoming.length > 0 ? (
        <>
          <ul style={{ ...note, paddingLeft: 18, display: "grid", gap: 2 }}>
            {data.upcoming.map((m) => (
              <li key={m.member_id}>Anëtarësia e {m.full_name} fillon më {formatDate(m.start_date)}</li>
            ))}
            {data.upcomingTotal > data.upcoming.length ? (
              <li>+{data.upcomingTotal - data.upcoming.length} të tjerë</li>
            ) : null}
          </ul>
          <UpcomingJump upcoming={data.upcoming} nowPeriod={nowPeriod} onPickMonth={onPickMonth} />
        </>
      ) : (
        <p style={note}>
          Anëtarësitë ekzistuese kanë mbaruar, janë të pezulluara ose fillojnë më vonë. Kontrollo planet te <Link href="/admin/people">njerëzit</Link>.
        </p>
      )}
    </div>
  );
}

/**
 * "Kalo te Shtatori 2026" — moves the invoice date to the first month in which
 * somebody actually starts, which refetches the roster for it. Only offered
 * when that month has begun: a future month cannot be generated at all, so
 * sending the admin there would swap one dead end for another.
 */
function UpcomingJump({
  upcoming, nowPeriod, onPickMonth,
}: {
  upcoming: { start_date: string }[];
  nowPeriod: string;
  onPickMonth: (period: string) => void;
}) {
  const first = upcoming[0]?.start_date;
  const target = first ? monthStartOf(first) : null;
  if (!target || target > nowPeriod) return null;
  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPickMonth(target)}>
        Kalo te {periodLabel(target)}
      </button>
    </div>
  );
}

/** The ids to preselect: everyone the server says can be billed. */
function initialIds(result: EligibilityResult): string[] {
  return result.ok ? result.data.members.map((m) => m.member_id) : [];
}

/** "2026-09-14" → "2026-09-01", the first-of-month billing bucket. Null when
 * the input is not a usable date, so no caller ever fetches a bogus month. */
function monthStartOf(date: string): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month0 = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month0 < 0 || month0 > 11 || day < 1 || day > 31) return null;
  return periodOf(Number(m[1]), month0);
}

/**
 * "YYYY-MM-DD" invoice date → "DD.MM.YYYY" due date (invoice date + 5 days).
 * Null when the input is not a valid date, so the caller can disable the run.
 */
function dueDateLabel(issuedOn: string): string | null {
  const m = issuedOn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
