"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/errors";
import {
  DISCOUNT_REASON_MAX, HALF_PRICE_DEFAULT_REASON, PAID_METHOD_LABEL, formatDate, formatEur, periodLabel,
} from "@/lib/finance";
import {
  PREPAY_DEFAULT_MONTHS, PREPAY_MAX_MONTHS, PREPAY_METHODS, PREPAY_NOTES_MAX,
  computePrepayPreview, monthCount, prepayBlockMessage, prepayFirstPeriodChoices, prepayPeriods, prepaySummary,
  type PrepayMemberOption, type PrepayMethod, type PrepayMonth,
} from "@/lib/prepay";
import { Modal } from "@/components/ui/Modal";
import { NumericInput } from "@/components/admin/NumericInput";
import { prepaymentPreview, recordPrepayment, type PrepayContext } from "./prepayActions";

const LOAD_FAILED = "Leximi i të dhënave të anëtarit dështoi. Provo sërish.";
const SAVE_FAILED = "Regjistrimi i parapagimit dështoi. Provo sërish.";

const LABEL = {
  fontSize: 11, letterSpacing: ".08em", color: "var(--ink-3)", display: "block", marginBottom: 6,
} as const;

/** The badge for one month of the preview, and its tone (.badge-st modifiers). */
function monthBadge(m: PrepayMonth): { text: string; tone: string } {
  switch (m.state) {
    case "new":
      return { text: "E re", tone: "ember" };
    case "mark_paid":
      return { text: "Faturë ekzistuese — shënohet e paguar", tone: "warn" };
    case "settled":
      return {
        text: m.settled_status === "waived"
          ? "E falur tashmë — nuk mund të parapaguhet"
          : "E paguar tashmë — nuk mund të parapaguhet",
        tone: "err",
      };
    case "not_covered":
      return { text: "Pa anëtarësi me pagesë — nuk mund të parapaguhet", tone: "err" };
  }
}

/**
 * "Regjistro parapagim" — one member pays several months at once.
 *
 * Every month becomes its own invoice, PAID on the payment date, all linked to
 * one prepayment (record_prepayment, migration 20260913000001). The preview is
 * computed live, in the browser, by the SAME pure function the server uses
 * (computePrepayPreview in lib/prepay), over the member's memberships and
 * invoices read once when the member is picked — so what this screen promises
 * is what the database does, and a blocked month is named before saving.
 *
 * `today` and `nowPeriod` are the CLUB's day and month from the server: no
 * clock is read here, so SSR and hydration cannot disagree after midnight.
 */
export function PrepayModal({
  members, membersError, today, nowPeriod,
}: {
  /** Members with an ACTIVE billable membership, sorted by name. */
  members: PrepayMemberOption[];
  /** Set when that list could not be read — never shown as "nobody". */
  membersError: string | null;
  /** "YYYY-MM-DD", the club's day. Default and max of the payment date. */
  today: string;
  /** "YYYY-MM-01", the club's month. Centre of the ±12-month window. */
  nowPeriod: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<PrepayContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [firstPeriod, setFirstPeriod] = useState(nowPeriod);
  const [monthsText, setMonthsText] = useState(String(PREPAY_DEFAULT_MONTHS));
  const [half, setHalf] = useState<string[]>([]);
  const [reason, setReason] = useState(HALF_PRICE_DEFAULT_REASON);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PrepayMethod>("cash");
  const [notes, setNotes] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);

  // Which member read is the current one: a slow answer for a member the admin
  // already moved away from must never land under another member's name.
  const seqRef = useRef(0);

  function resetForm() {
    seqRef.current++;
    setSearch("");
    setMemberId(null);
    setCtx(null);
    setLoading(false);
    setLoadErr(null);
    setFirstPeriod(nowPeriod);
    setMonthsText(String(PREPAY_DEFAULT_MONTHS));
    setHalf([]);
    setReason(HALF_PRICE_DEFAULT_REASON);
    setPaidOn(today);
    setMethod("cash");
    setNotes("");
    setMsg(null);
    setDone(null);
  }

  /** Reads the member's rows. `keep` refreshes them without moving the form. */
  function loadMember(id: string, keep = false) {
    const seq = ++seqRef.current;
    setMemberId(id);
    setLoading(true);
    setLoadErr(null);
    if (!keep) {
      setCtx(null);
      setHalf([]);
      setMsg(null);
    }
    prepaymentPreview(id)
      .then((r) => {
        if (seqRef.current !== seq) return;
        setLoading(false);
        if (!r.ok) { setLoadErr(r.error); return; }
        setCtx(r.data);
        if (!keep) setFirstPeriod(r.data.defaultFirstPeriod);
      })
      .catch((e) => {
        if (seqRef.current !== seq) return;
        setLoading(false);
        setLoadErr(actionError(e, LOAD_FAILED) ?? LOAD_FAILED);
      });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? members.filter((m) => m.full_name.toLowerCase().includes(q)) : members;
  }, [members, search]);
  const picked = memberId ? members.find((m) => m.member_id === memberId) ?? null : null;
  const memberName = ctx?.full_name ?? picked?.full_name ?? "";

  const monthsTrim = monthsText.trim();
  const months = /^\d{1,2}$/.test(monthsTrim) ? Number(monthsTrim) : NaN;
  const monthsValid = Number.isInteger(months) && months >= 1 && months <= PREPAY_MAX_MONTHS;

  // Only the ½ marks inside the chosen range are sent: shortening the range
  // drops the marks on the months that fell out, instead of refusing.
  const halfInRange = useMemo(() => {
    if (!monthsValid) return [];
    const range = new Set(prepayPeriods(firstPeriod, months));
    return half.filter((p) => range.has(p));
  }, [half, firstPeriod, months, monthsValid]);

  const preview = useMemo(() => (ctx
    ? computePrepayPreview({
      memberId: ctx.member_id, memberships: ctx.memberships, dues: ctx.dues,
      firstPeriod, months, halfPeriods: halfInRange, paidOn, method, today, currentPeriod: nowPeriod,
    })
    : null), [ctx, firstPeriod, months, halfInRange, paidOn, method, today, nowPeriod]);

  // What is sent: marked months where the ½ actually does something.
  const halfSent = preview ? preview.months.filter((m) => m.halvedNow).map((m) => m.period) : [];
  const reasonTrim = reason.trim();
  const reasonTooLong = halfSent.length > 0 && reasonTrim.length > DISCOUNT_REASON_MAX;
  const notesTooLong = notes.trim().length > PREPAY_NOTES_MAX;
  const canSave = !!ctx && !!preview && !preview.blocked && !loading && !pending && !reasonTooLong && !notesTooLong;

  function toggleHalf(period: string) {
    setHalf((cur) => (cur.includes(period) ? cur.filter((p) => p !== period) : [...cur, period]));
  }

  function save() {
    if (!ctx || !preview || preview.blocked) return;
    const snapshot = { name: ctx.full_name, total: preview.total };
    setMsg(null);
    start(async () => {
      try {
        const r = await recordPrepayment({
          memberId: ctx.member_id,
          firstPeriod,
          months,
          paidOn,
          method,
          halfPeriods: halfSent,
          discountReason: reasonTrim,
          notes: notes.trim(),
        });
        if (!r.ok) {
          setMsg(r.error);
          // The member's invoices may have changed under the screen (the cron,
          // another staff member): re-read them so the preview says why.
          loadMember(ctx.member_id, true);
          return;
        }
        setDone({
          id: r.id,
          text: `U regjistrua parapagimi i ${snapshot.name}: ${prepaySummary(r.total ?? snapshot.total, r.months, r.rangeLabel)}.`,
        });
        router.refresh();
      } catch (e) {
        const text = actionError(e, SAVE_FAILED);
        if (text) setMsg(text);
        else router.refresh();
      }
    });
  }

  const choices = useMemo(() => prepayFirstPeriodChoices(nowPeriod), [nowPeriod]);

  return (
    <div style={{ textAlign: "right" }}>
      <button
        type="button"
        className="btn"
        style={{ minHeight: 44 }}
        onClick={() => { resetForm(); setOpen(true); }}
      >
        Regjistro parapagim
      </button>
      {membersError ? (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--err)", marginTop: 6, lineHeight: 1.7, maxWidth: 260, marginLeft: "auto" }}>
          {membersError}
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title="Regjistro parapagim"
        footer={done ? (
          <>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => setOpen(false)}>
              Mbyll
            </button>
            <button type="button" className="btn btn-ember" style={{ minHeight: 44 }} onClick={resetForm}>
              Regjistro një tjetër
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => setOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button type="button" className="btn btn-ember" style={{ minHeight: 44 }} onClick={save} disabled={!canSave}>
              {pending ? "Duke ruajtur…" : "Regjistro parapagimin"}
            </button>
          </>
        )}
      >
        {done ? (
          <div style={{ display: "grid", gap: 14, textAlign: "left" }}>
            <div className="mm-msg ok" style={{ fontSize: 13, lineHeight: 1.6 }}>{done.text}</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
              Çdo muaj ka tani faturën e vet, të shënuar si të paguar. Dokumenti i parapagimit i përmbledh të gjitha dhe mund të printohet ose t’i dërgohet anëtarit.
            </div>
            <div>
              <a
                className="btn btn-ghost"
                href={`/invoice/prepay/${done.id}`}
                target="_blank"
                rel="noopener"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
              >
                Hap dokumentin e parapagimit ↗
              </a>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, textAlign: "left" }}>
            {/* 1) The member. */}
            <div>
              <span className="mono" style={LABEL}>ANËTARI</span>
              {memberId ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10, border: "1px solid var(--line-strong)", borderRadius: 10, padding: "6px 6px 6px 12px", background: "var(--white)" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {memberName}
                    </span>
                    {picked ? (
                      <span style={{ display: "block", fontSize: 11, color: "var(--ink-3)" }}>
                        {picked.plan_name ?? "Pa plan"} · {formatEur(picked.amount_eur)} / muaj
                      </span>
                    ) : null}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={resetForm} disabled={pending}>
                    Ndrysho
                  </button>
                </div>
              ) : membersError ? (
                <div style={{ fontSize: 13, color: "var(--err)" }}>{membersError}</div>
              ) : members.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
                  Asnjë anëtar nuk ka anëtarësi aktive me pagesë. Parapagimi regjistrohet vetëm për anëtarë me plan me pagesë.
                </div>
              ) : (
                <div style={{ border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--white)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
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
                      style={{ width: "100%", minHeight: 44 }}
                    />
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto" }}>
                    {filtered.length === 0 ? (
                      <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: 12 }}>Asnjë anëtar.</div>
                    ) : filtered.map((m) => (
                      <button
                        key={m.member_id}
                        type="button"
                        onClick={() => loadMember(m.member_id)}
                        style={{
                          display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10,
                          width: "100%", minHeight: 48, padding: "6px 12px", textAlign: "left", cursor: "pointer",
                          background: "var(--white)", border: 0, borderBottom: "1px solid var(--line)", color: "var(--ink)",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.full_name}
                          </span>
                          {m.plan_name ? (
                            <span style={{ display: "block", fontSize: 11, color: "var(--ink-3)" }}>{m.plan_name}</span>
                          ) : null}
                        </span>
                        <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                          {formatEur(m.amount_eur)} / muaj
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {memberId && loading && !ctx ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Duke lexuar faturat e anëtarit…</div>
            ) : null}
            {memberId && loadErr ? (
              <div style={{ border: "1px solid var(--err)", borderRadius: 10, padding: 12, background: "var(--white)" }}>
                <div style={{ fontSize: 13, color: "var(--err)" }}>{loadErr}</div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8, minHeight: 44 }} onClick={() => loadMember(memberId, !!ctx)}>
                  Provo sërish
                </button>
              </div>
            ) : null}

            {ctx && preview ? (
              <>
                {/* 2) The range. */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="pp-first">Muaji i parë</label>
                    <select id="pp-first" value={firstPeriod} onChange={(e) => setFirstPeriod(e.target.value)}>
                      {choices.map((p) => (
                        <option key={p} value={p}>
                          {periodLabel(p)}{p === nowPeriod ? " (muaji aktual)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="pp-months">Numri i muajve (1–{PREPAY_MAX_MONTHS})</label>
                    <NumericInput kind="int" id="pp-months" value={monthsText} onChange={setMonthsText} />
                  </div>
                </div>

                {/* 3) The live per-month preview. */}
                {preview.months.length > 0 ? (
                  <div style={{ border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--white)", overflow: "hidden" }}>
                    {preview.months.map((m) => {
                      const badge = monthBadge(m);
                      const on = m.halvedNow || (m.state === "mark_paid" && m.reduced && !m.halvable);
                      return (
                        <div
                          key={m.period}
                          style={{
                            display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center",
                            gap: 10, padding: "8px 10px", borderBottom: "1px solid var(--line)",
                            background: badge.tone === "err" ? "color-mix(in oklab, var(--err) 5%, var(--white))" : "var(--white)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
                              {m.plan_name ?? "Pa plan"}{m.invoice_no ? ` · ${m.invoice_no}` : ""}
                            </div>
                            <span className={`badge-st ${badge.tone}`} style={{ marginTop: 5, whiteSpace: "normal", lineHeight: 1.4 }}>
                              {badge.text}
                            </span>
                          </div>
                          <div className="mono" style={{ fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>
                            {m.amount == null ? "—" : formatEur(m.amount)}
                            {m.reduced && m.full_amount != null ? (
                              <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)" }}>
                                nga <s>{formatEur(m.full_amount)}</s>
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleHalf(m.period)}
                            disabled={!m.halvable || pending}
                            aria-pressed={on}
                            aria-label={`Gjysmë çmimi për ${m.label}`}
                            title={m.state === "mark_paid" && m.reduced && !m.halvable ? "Kjo faturë është tashmë me gjysmë çmimi" : "Gjysmë çmimi"}
                            style={{
                              minWidth: 44, minHeight: 44, borderRadius: 10, fontSize: 15, fontWeight: 700,
                              cursor: m.halvable ? "pointer" : "default", opacity: m.halvable || on ? 1 : 0.35,
                              border: `1px solid ${on ? "var(--warn)" : "var(--line-strong)"}`,
                              background: on ? "color-mix(in oklab, var(--warn) 14%, var(--white))" : "var(--white)",
                              color: on ? "var(--warn)" : "var(--ink-3)",
                            }}
                          >
                            ½
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* 4) The reason, only when a month is actually halved. */}
                {halfSent.length > 0 ? (
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="pp-reason">Arsyeja e gjysmë çmimit</label>
                    <input
                      id="pp-reason"
                      value={reason}
                      maxLength={DISCOUNT_REASON_MAX}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={HALF_PRICE_DEFAULT_REASON}
                    />
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6 }}>
                      Shfaqet te fatura e {halfSent.length === 1 ? "muajit" : `${halfSent.length} muajve`} me ½. Çmimi i plotë ruhet te fatura.
                    </div>
                  </div>
                ) : null}

                {/* 5) The payment. */}
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="pp-date">Data e pagesës</label>
                  <input id="pp-date" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} style={{ maxWidth: 220 }} />
                </div>
                <div>
                  <span className="mono" style={LABEL}>MËNYRA E PAGESËS</span>
                  <div role="group" aria-label="Mënyra e pagesës" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {PREPAY_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={method === m}
                        onClick={() => setMethod(m)}
                        className={`chip${method === m ? " active" : ""}`}
                        style={{ minHeight: 44, minWidth: 88 }}
                      >
                        {PAID_METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="pp-notes">Shënim (opsional)</label>
                  <input
                    id="pp-notes"
                    value={notes}
                    maxLength={PREPAY_NOTES_MAX}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="p.sh. numri i dëftesës"
                  />
                </div>

                {/* 6) The total, or the one reason it cannot be saved. */}
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  {preview.blocked ? (
                    <div style={{ fontSize: 13, color: "var(--err)", lineHeight: 1.6 }}>
                      {prepayBlockMessage(preview.blocked, nowPeriod)}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
                        {prepaySummary(preview.total, months, preview.rangeLabel)}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.7 }}>
                        {monthCount(months)} · çdo muaj bëhet faturë më vete, e paguar më {formatDate(paidOn)} ({PAID_METHOD_LABEL[method].toLowerCase()}).
                        {" "}Gjenerimi automatik dhe ai me dorë nuk i faturojnë sërish këta muaj.
                      </div>
                    </>
                  )}
                  {loading ? (
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>Duke rifreskuar faturat e anëtarit…</div>
                  ) : null}
                </div>
              </>
            ) : null}

            {msg ? <div className="mm-msg err" style={{ fontSize: 13, lineHeight: 1.6 }}>{msg}</div> : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
