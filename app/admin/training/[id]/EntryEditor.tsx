"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEntry, removeEntry } from "../actions";
import { NumericInput, type NumericKind } from "@/components/admin/NumericInput";
import {
  RIDE_METRIC_FIELDS, METRIC_GROUPS, type MetricField, type MetricGroupKey,
  formatDurationHMS, parseDurationToSeconds, wPerKg, computeIntensity, computeTss,
} from "@/lib/training";

export type EntryRow = {
  id: string;
  athlete_id: string;
  participated: boolean;
  set_ftp: boolean;
  strava_url: string | null;
  [key: string]: unknown; // metric columns
};

export type EntryAthlete = { id: string; full_name: string; section_slug: string | null; weight_kg: number | null; ftp_w: number | null };

// All metric groups are shown when a cyclist card is expanded (no "more" toggle).
const PRIMARY_GROUPS: MetricGroupKey[] = ["core", "hr", "power"];
const SECONDARY_GROUPS: MetricGroupKey[] = ["bests", "effort", "extra"];

function initialValues(entry: EntryRow): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of RIDE_METRIC_FIELDS) {
    const raw = entry[f.key];
    if (f.ui === "duration") v[f.key] = formatDurationHMS(typeof raw === "number" ? raw : null);
    else v[f.key] = raw == null ? "" : String(raw);
  }
  return v;
}

export function EntryEditor({
  rideId, entry, athlete, index, defaultOpen = false,
}: {
  rideId: string;
  entry: EntryRow;
  athlete: EntryAthlete;
  index: number;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [values, setValues] = useState<Record<string, string>>(() => initialValues(entry));
  const [participated, setParticipated] = useState(entry.participated);
  const [setFtp, setSetFtp] = useState(entry.set_ftp);

  function setField(key: string, val: string) {
    setValues((s) => ({ ...s, [key]: val }));
  }

  // Derived values. Effective FTP = this ride's FTP, else the athlete's profile
  // FTP. IF and TSS are computed from NP + FTP + moving time (never typed).
  const ftpNow = values.ftp_w ? parseInt(values.ftp_w, 10) : null;
  const effectiveFtp = ftpNow ?? athlete.ftp_w;
  const npNow = values.np_w ? parseInt(values.np_w, 10) : null;
  const movingSec = parseDurationToSeconds(values.moving_seconds ?? "");
  const computedIf = computeIntensity(npNow, effectiveFtp);
  const computedTss = computeTss(movingSec, npNow, effectiveFtp);
  const computedDisplay: Record<string, string> = {
    intensity_factor: computedIf != null ? computedIf.toFixed(2) : "—",
    tss: computedTss != null ? String(computedTss) : "—",
  };
  const wkg = wPerKg(ftpNow, athlete.weight_kg);
  const summaryFields = RIDE_METRIC_FIELDS.filter((f) => f.summary);

  // Snapshot that changes whenever any editable value changes.
  const snapshot = useMemo(
    () => JSON.stringify({ values, participated, setFtp }),
    [values, participated, setFtp],
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => {
      setMsg(null);
      const metrics: Record<string, string> = {};
      for (const f of RIDE_METRIC_FIELDS) {
        const raw = values[f.key] ?? "";
        if (f.ui === "duration") {
          const sec = parseDurationToSeconds(raw);
          metrics[f.key] = sec == null ? "" : String(sec);
        } else {
          metrics[f.key] = raw;
        }
      }
      // IF & TSS are derived, not typed — overwrite whatever the loop set.
      metrics.intensity_factor = computedIf != null ? String(computedIf) : "";
      metrics.tss = computedTss != null ? String(computedTss) : "";
      startSave(async () => {
        const r = await updateEntry(rideId, entry.id, {
          participated, set_ftp: setFtp, metrics,
        });
        setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error });
        if (r.ok) setTimeout(() => setMsg(null), 1400);
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  async function onRemove() {
    if (!window.confirm(`Hiq ${athlete.full_name} nga kjo stërvitje?`)) return;
    const r = await removeEntry(rideId, entry.id);
    if (r.ok) router.refresh();
    else setMsg({ ok: false, text: r.error });
  }

  const initials = athlete.full_name.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "?";

  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 14, background: "var(--white)",
      boxShadow: "0 1px 2px rgba(15,26,46,.04), 0 6px 18px rgba(15,26,46,.05)",
      opacity: participated ? 1 : 0.72, transition: "box-shadow .2s ease, opacity .2s ease",
    }}>
      {/* Header row — always visible */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", width: 20 }}>{String(index + 1).padStart(2, "0")}</div>
        <div style={{
          width: 34, height: 34, borderRadius: 999, flexShrink: 0,
          background: "color-mix(in oklab, var(--teal) 24%, var(--white))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{athlete.full_name}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {!participated ? "Nuk mori pjesë" : summaryLine(summaryFields, values) || "Ende pa vlera"}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, width: 66, textAlign: "right", color: msg?.ok === false ? "var(--err)" : pending ? "var(--ink-3)" : "var(--ok)" }}>
          {pending ? "…" : msg?.ok ? "✓" : ""}
        </div>
        <span aria-hidden style={{ color: "var(--ink-3)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </div>

      {open && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid var(--line)" }}>
          {/* Participation */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "12px 0", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={participated} onChange={(e) => setParticipated(e.target.checked)} style={{ accentColor: "var(--ember)" }} />
            Mori pjesë
          </label>

          {PRIMARY_GROUPS.map((g) => (
            <MetricGroup key={g} groupKey={g} values={values} onChange={setField} extra={
              g === "power" ? (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
                    <input type="checkbox" checked={setFtp} onChange={(e) => setSetFtp(e.target.checked)} style={{ accentColor: "var(--ember)" }} />
                    Vendos FTP-në në profil
                  </label>
                  {wkg != null && <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{wkg} W/kg</span>}
                </div>
              ) : null
            } />
          ))}

          {SECONDARY_GROUPS.map((g) => (
            <MetricGroup key={g} groupKey={g} values={values} onChange={setField} computed={computedDisplay} />
          ))}

          {msg?.ok === false && (
            <div className="mono" style={{ color: "var(--err)", fontSize: 12, marginTop: 10 }}>Gabim: {msg.text}</div>
          )}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={onRemove}>Hiq çiklistin</button>
          </div>
        </div>
      )}
    </div>
  );
}

function summaryLine(fields: MetricField[], values: Record<string, string>): string {
  const parts: string[] = [];
  for (const f of fields) {
    const raw = values[f.key] ?? "";
    if (raw.trim() === "") continue;
    if (f.ui === "duration") parts.push(raw);
    else parts.push(`${raw}${f.unit ? " " + f.unit : ""}`);
  }
  return parts.join(" · ");
}

function MetricGroup({
  groupKey, values, onChange, extra, computed,
}: {
  groupKey: MetricGroupKey;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  extra?: React.ReactNode;
  computed?: Record<string, string>;
}) {
  const group = METRIC_GROUPS.find((g) => g.key === groupKey)!;
  const fields = RIDE_METRIC_FIELDS.filter((f) => f.group === groupKey);
  return (
    <div style={{ marginTop: 14 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
        {group.label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {fields.map((f) => f.computed
          ? <MetricDisplay key={f.key} field={f} value={computed?.[f.key] ?? "—"} />
          : <MetricInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} />)}
        {extra}
      </div>
    </div>
  );
}

function MetricDisplay({ field, value }: { field: MetricField; value: string }) {
  return (
    <label className="field" style={{ marginBottom: 0, gap: 4 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{field.label}</span>
        <span style={{ fontSize: 9, color: "var(--slate)" }}>automatik</span>
      </span>
      <div
        title="Llogaritet vetë nga NP dhe FTP"
        style={{
          padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)",
          background: "var(--paper)", color: "var(--ink-2)",
          fontFamily: "var(--font-mono)", fontSize: 13.5, minHeight: 38,
          display: "flex", alignItems: "center",
        }}
      >
        {value}
      </div>
    </label>
  );
}

function MetricInput({ field, value, onChange }: { field: MetricField; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field" style={{ marginBottom: 0, gap: 4 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{field.label}</span>
        {field.unit && <span style={{ fontSize: 9, color: "var(--slate)" }}>{field.unit}</span>}
      </span>
      <NumericInput
        kind={metricKind(field)}
        value={value}
        onChange={onChange}
        placeholder={field.placeholder}
        hint={field.hint}
        ariaLabel={field.unit ? `${field.label} (${field.unit})` : field.label}
      />
    </label>
  );
}

/** Metric definition → keypad. Durations are typed as bare minutes on a phone. */
function metricKind(field: MetricField): NumericKind {
  if (field.ui === "duration") return "duration";
  return field.kind === "num" ? "decimal" : "int";
}
