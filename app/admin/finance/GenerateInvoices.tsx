"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { generateInvoicesForMembers } from "./actions";

export type EligibleMember = {
  member_id: string;
  full_name: string;
  plan_name: string | null;
};

/**
 * Opens a modal that asks for the INVOICE DATE and a multiselect of the members
 * to bill for the month — instead of silently billing everyone. The RPC is
 * idempotent (unique(member_id, period)), so the copy says outright that a
 * second press bills no one twice.
 */
export function GenerateInvoices({
  period, label, when = "current", members,
}: {
  period: string;
  label: string;
  /** Where the shown month sits relative to today. Future months cannot be
   * generated at all; past ones can (backfill), but the invoices land already
   * past their due date, so the copy warns before the click. */
  when?: "past" | "current" | "future";
  /** The members who WOULD be billed for this month (active, billable, amount
   * > 0), each with their plan — the modal defaults them all to selected. */
  members: EligibleMember[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // The invoice date. Defaults to the first day of the shown month; editable.
  const [issuedOn, setIssuedOn] = useState(period);
  // Selected member ids — default ALL selected (deselect to exclude).
  const [selected, setSelected] = useState<string[]>(members.map((m) => m.member_id));
  const [search, setSearch] = useState("");

  // Reset the form each time the modal opens, so a reopened panel reflects the
  // current month's eligible list and the default date, not a stale run.
  useEffect(() => {
    if (!open) return;
    setIssuedOn(period);
    setSelected(members.map((m) => m.member_id));
    setSearch("");
    setMsg(null);
  }, [open, period, members]);

  const dueLabel = useMemo(() => dueDateLabel(issuedOn), [issuedOn]);
  const invalidDate = !dueLabel;

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
    setMsg(null);
    start(async () => {
      try {
        const r = await generateInvoicesForMembers(selected, issuedOn);
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setMsg({ ok: true, text: created(r.created) });
        router.refresh();
      } catch (e) {
        const text = actionError(e, "Gjenerimi i faturave dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  if (when === "future") {
    return (
      <div style={{ textAlign: "right", maxWidth: 260 }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", lineHeight: 1.7 }}>
          {label} nuk ka filluar ende. Faturat gjenerohen brenda muajit.
        </div>
      </div>
    );
  }

  const noneSelected = selected.length === 0;
  const noEligible = members.length === 0;

  return (
    <div style={{ textAlign: "right" }}>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>
        Gjenero faturat për {label}
      </button>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-3)", marginTop: 8 }}>
        Mund ta shtypësh disa herë — fatura e dyfishtë nuk krijohet.
      </div>

      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title={`Gjenero faturat për ${label}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn-ember"
              onClick={run}
              disabled={pending || noneSelected || invalidDate || noEligible}
            >
              {pending ? "Duke gjeneruar…" : `Gjenero (${selected.length})`}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16, textAlign: "left" }}>
          {/* 1) Invoice date + resulting due date. */}
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
            {when === "past" && !invalidDate ? (
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".06em", color: "var(--warn)", marginTop: 6, lineHeight: 1.7 }}>
                Kujdes: {label} ka kaluar — këto fatura krijohen menjëherë në vonesë dhe nuk fshihen dot.
              </div>
            ) : null}
          </div>

          {/* 2) The members to bill — default all selected, deselect to exclude. */}
          <div>
            <label className="mono" style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
              ANËTARËT E AKADEMISË
            </label>
            {noEligible ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: "10px 0" }}>
                Asnjë anëtar për t’u faturuar këtë muaj — ose të gjithë e kanë faturën tashmë, ose asnjë anëtarësi me pagesë nuk është aktive.
              </div>
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
                  {selected.length} të zgjedhur nga {members.length}
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
