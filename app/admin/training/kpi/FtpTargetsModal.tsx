"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { setFtpTargets } from "./actions";

export type FtpModalRow = {
  id: string;
  name: string;
  /** The target a coach already saved for this month, W. */
  target: number | null;
  /** The rider's best 20-min power registered in this month, W. */
  best: number | null;
  /** Their best in the month before — what they are compared with when no target is set. */
  prevBest: number | null;
};

export type FtpModalMonth = { period: string; label: string; rows: FtpModalRow[] };

const key = (period: string, id: string) => `${period}|${id}`;

/**
 * "Targetet FTP": the 20-minute power target of every active cyclist for a
 * month, set in one place. Nothing here is required — a box left empty means the
 * rider is compared with their own best of the previous month, which is also what
 * "Plotëso me muajin e kaluar" pre-fills so a coach can start from real numbers
 * and only adjust. One Save writes every change across the months touched.
 * The months and numbers all come from the server, so this component never reads
 * a clock.
 */
export function FtpTargetsModal({ months, defaultIndex }: { months: FtpModalMonth[]; defaultIndex: number }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(defaultIndex);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // What is saved right now, and what the coach has typed on top of it.
  const baseline = useMemo(() => {
    const b: Record<string, string> = {};
    for (const m of months) for (const r of m.rows) b[key(m.period, r.id)] = r.target != null ? String(r.target) : "";
    return b;
  }, [months]);
  const [values, setValues] = useState<Record<string, string>>(baseline);

  // Whenever the dialog is closed it goes back to what is saved: cancelling
  // discards edits, and a save that just refreshed the page hands in the new
  // numbers. Resetting on CLOSE (not on open) means reopening never flashes the
  // previous, unsaved values for a frame.
  useEffect(() => {
    if (!open) {
      setValues(baseline);
      setIdx(defaultIndex);
      setError(null);
    }
  }, [open, baseline, defaultIndex]);

  const month = months[idx] ?? months[0];
  const dirty = Object.keys(values).filter((k) => (values[k] ?? "").trim() !== (baseline[k] ?? ""));
  const dirtyMonths = new Set(dirty.map((k) => k.split("|")[0]));

  function fillFromLastMonth() {
    setValues((cur) => {
      const next = { ...cur };
      for (const r of month.rows) {
        const k = key(month.period, r.id);
        if ((next[k] ?? "").trim() === "" && r.prevBest != null) next[k] = String(r.prevBest);
      }
      return next;
    });
  }

  function save() {
    setError(null);
    const items = dirty.map((k) => {
      const [period, athleteId] = k.split("|");
      return { athleteId, period, value: values[k] ?? "" };
    });
    start(async () => {
      try {
        const r = await setFtpTargets(items);
        if (!r.ok) { setError(r.error); return; }
        setOpen(false);
      } catch (e) {
        setError(actionError(e, "Ruajtja e targeteve dështoi. Provo sërish."));
      }
    });
  }

  const canFill = month.rows.some((r) => (values[key(month.period, r.id)] ?? "").trim() === "" && r.prevBest != null);

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)} style={{ minHeight: 44 }}>
        Targetet FTP
      </button>

      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title="Targetet FTP për çiklistët"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>Anulo</button>
            <button type="button" className="btn btn-ember" onClick={save} disabled={pending || dirty.length === 0}>
              {pending ? "Duke ruajtur…" : dirty.length ? `Ruaj (${dirty.length})` : "Ruaj"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14, textAlign: "left" }}>
          <p className="mono" style={{ margin: 0, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Fuqia më e mirë 20-min që pritet nga secili çiklist këtë muaj, në vat. Bosh = automatik: krahasohet me më të mirën e muajit të kaluar.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {months.map((m, i) => (
              <button
                key={m.period}
                type="button"
                onClick={() => setIdx(i)}
                aria-pressed={i === idx}
                className={`chip ${i === idx ? "active" : ""}`}
                style={{ minHeight: 40, cursor: "pointer" }}
              >
                {m.label}{dirtyMonths.has(m.period) ? " •" : ""}
              </button>
            ))}
          </div>

          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillFromLastMonth} disabled={!canFill} style={{ minHeight: 40 }}>
              Plotëso me muajin e kaluar
            </button>
          </div>

          {month.rows.length === 0 ? (
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Nuk ka çiklistë aktivë.</div>
          ) : (
            <div style={{ display: "grid" }}>
              {month.rows.map((r) => (
                <div
                  key={r.id}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 112px", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      muaji i kaluar {r.prevBest != null ? `${r.prevBest} W` : "—"} · tani {r.best != null ? `${r.best} W` : "—"}
                    </div>
                  </div>
                  <NumericInput
                    kind="int"
                    value={values[key(month.period, r.id)] ?? ""}
                    onChange={(v) => setValues((cur) => ({ ...cur, [key(month.period, r.id)]: v }))}
                    placeholder="Automatik"
                    ariaLabel={`Target 20-min për ${r.name}, ${month.label} (W)`}
                    style={{ minHeight: 44, width: "100%" }}
                  />
                </div>
              ))}
            </div>
          )}

          {error ? <div className="mm-msg err">{error}</div> : null}
        </div>
      </Modal>
    </>
  );
}
