"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NumericInput } from "@/components/admin/NumericInput";
import {
  TRAINING_FOCUS, METRIC_GROUPS, RIDE_METRIC_FIELDS, type MetricField,
  computeIntensity, computeTss, formatDurationHMS, parseDurationToSeconds,
} from "@/lib/training";
import { findStravaGroups, importStravaGroup, type ImportSuggestion } from "./actions";

type Section = { id: string; name_sq: string };
type RiderSuggestion = ImportSuggestion["riders"][number];

function metricStrings(rider: RiderSuggestion): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of RIDE_METRIC_FIELDS) {
    const value = rider.metrics[field.key as keyof typeof rider.metrics];
    values[field.key] = value == null ? "" : field.ui === "duration" ? formatDurationHMS(value) : String(value);
  }
  return values;
}

export function ImportReview({ sections }: { sections: Section[] }) {
  const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const started = useRef(false);

  const refresh = useCallback(() => {
    startLoading(async () => {
      setError(null);
      const result = await findStravaGroups();
      if (result.ok) {
        setSuggestions(result.suggestions);
        setConnectedCount(result.connectedCount);
      } else setError(result.error);
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    refresh();
  }, [refresh]);

  return <div style={{ display: "grid", gap: 16, maxWidth: 860 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-ember" disabled={loading} onClick={refresh}>
        {loading ? "Duke kërkuar…" : "Rifresko përputhjet"}
      </button>
      <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
        {connectedCount} çiklistë të lidhur · 7 ditët e fundit
      </span>
    </div>
    {error && <p role="alert" style={{ color: "var(--err)" }}>{error}</p>}
    {!loading && !error && suggestions.length === 0 &&
      <div className="card" style={{ padding: 20 }}>Nuk ka stërvitje grupore që plotësojnë përputhjen e rrugës 60%, kohës dhe ngjitjes.</div>}
    {suggestions.map((suggestion) =>
      <SuggestionCard key={suggestion.key} suggestion={suggestion} sections={sections}
        onImported={() => setSuggestions((items) => items.filter((item) => item.key !== suggestion.key))} />)}
  </div>;
}

function SuggestionCard({ suggestion, sections, onImported }: {
  suggestion: ImportSuggestion; sections: Section[]; onImported: () => void;
}) {
  const router = useRouter();
  const [rideDate, setRideDate] = useState(suggestion.rideDate);
  const [title, setTitle] = useState(suggestion.title);
  const [focus, setFocus] = useState(suggestion.focus);
  const [sectionId, setSectionId] = useState(suggestion.sectionId ?? "");
  const [base, setBase] = useState({
    distance_km: String(suggestion.base.distanceKm),
    moving_seconds: formatDurationHMS(suggestion.base.movingSeconds),
    elevation_m: String(suggestion.base.elevationM),
  });
  const [selected, setSelected] = useState(() => suggestion.riders.map((rider) => rider.athleteId));
  const [riderValues, setRiderValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(suggestion.riders.map((rider) => [rider.athleteId, metricStrings(rider)])));
  const [setFtp, setSetFtp] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const representative = suggestion.riders.find((rider) => selected.includes(rider.athleteId));
  const sharedStravaUrl = representative ? `https://www.strava.com/activities/${representative.activityId}` : "";

  function setRiderField(athleteId: string, key: string, value: string) {
    setRiderValues((current) => ({ ...current,
      [athleteId]: { ...current[athleteId], [key]: value },
    }));
  }

  function save() {
    if (selected.length < 2) { setError("Zgjidh dy ose më shumë çiklistë."); return; }
    startSaving(async () => {
      setError(null);
      const result = await importStravaGroup({
        riders: suggestion.riders.filter((rider) => selected.includes(rider.athleteId)).map((rider) => ({
          athleteId: rider.athleteId, activityId: rider.activityId,
          metrics: riderValues[rider.athleteId], setFtp: !!setFtp[rider.athleteId],
        })),
        rideDate, title, focus, sectionId: sectionId || null, base,
      });
      if (result.ok) {
        onImported();
        router.push(`/admin/training/${result.id}`);
      } else setError(result.error);
    });
  }

  return <div className="card" style={{ padding: 20, display: "grid", gap: 17 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <strong style={{ fontSize: 18, color: "var(--ink)" }}>{suggestion.rideDate} · {suggestion.riders.length} çiklistë</strong>
      <span className="mono" style={{ color: "var(--ok)", fontSize: 12 }}>Rrugë {suggestion.overlapPercent}%</span>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      <div className="field" style={{ margin: 0 }}><label>Data</label>
        <input type="date" value={rideDate} onChange={(event) => setRideDate(event.target.value)} /></div>
      <div className="field" style={{ margin: 0 }}><label>Lloji i ushtrimit *</label>
        <select value={focus} onChange={(event) => setFocus(event.target.value)}>
          {TRAINING_FOCUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></div>
      <div className="field" style={{ margin: 0 }}><label>Seksioni</label>
        <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">— Pa seksion —</option>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.name_sq}</option>)}
        </select></div>
    </div>
    <div className="field" style={{ margin: 0 }}><label>Titulli</label>
      <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
    <div className="field" style={{ margin: 0 }}><label>Strava</label>
      <input value={sharedStravaUrl} readOnly aria-label="Aktiviteti përfaqësues në Strava" /></div>

    <div>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>
        Bazë · për të gjithë · nga Strava
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <BaseField label="Distanca" unit="km" kind="decimal" value={base.distance_km}
          onChange={(value) => setBase((current) => ({ ...current, distance_km: value }))} />
        <BaseField label="Kohëzgjatja" unit="min" kind="duration" value={base.moving_seconds}
          onChange={(value) => setBase((current) => ({ ...current, moving_seconds: value }))} />
        <BaseField label="Ngjitja" unit="m" kind="int" value={base.elevation_m}
          onChange={(value) => setBase((current) => ({ ...current, elevation_m: value }))} />
      </div>
    </div>

    <div>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>Çiklistët · {selected.length} të zgjedhur</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {suggestion.riders.map((rider) => <label key={rider.athleteId} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line-strong)", borderRadius: 999, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={selected.includes(rider.athleteId)} onChange={(event) =>
            setSelected((current) => event.target.checked ? [...current, rider.athleteId] : current.filter((id) => id !== rider.athleteId))} />
          {rider.name}
        </label>)}
      </div>
    </div>

    <div style={{ display: "grid", gap: 10 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>Vlerat për çiklist · plotësuar nga Strava kur janë të disponueshme</div>
      {suggestion.riders.filter((rider) => selected.includes(rider.athleteId)).map((rider, index) =>
        <RiderReview key={rider.athleteId} rider={rider} index={index} values={riderValues[rider.athleteId]}
          setField={(key, value) => setRiderField(rider.athleteId, key, value)}
          setFtp={!!setFtp[rider.athleteId]} onSetFtp={(value) => setSetFtp((current) => ({ ...current, [rider.athleteId]: value }))} />)}
    </div>
    {error && <div role="alert" style={{ color: "var(--err)", fontSize: 13 }}>{error}</div>}
    <div><button type="button" className="btn btn-ember" disabled={saving} onClick={save}>
      {saving ? "Duke krijuar…" : "Krijo stërvitjen →"}
    </button></div>
  </div>;
}

function BaseField({ label, unit, kind, value, onChange }: {
  label: string; unit: string; kind: "decimal" | "duration" | "int"; value: string; onChange: (value: string) => void;
}) {
  return <label className="field" style={{ margin: 0, gap: 4 }}>
    <span style={{ display: "flex", justifyContent: "space-between" }}><span>{label}</span><span style={{ fontSize: 9, color: "var(--slate)" }}>{unit}</span></span>
    <NumericInput kind={kind} value={value} onChange={onChange} ariaLabel={`${label} (${unit})`} />
  </label>;
}

function RiderReview({ rider, index, values, setField, setFtp, onSetFtp }: {
  rider: RiderSuggestion; index: number; values: Record<string, string>;
  setField: (key: string, value: string) => void; setFtp: boolean; onSetFtp: (value: boolean) => void;
}) {
  const effectiveFtp = Number(values.ftp_w) || rider.referenceFtp;
  const np = Number(values.np_w) || null;
  const moving = parseDurationToSeconds(values.moving_seconds);
  const intensity = computeIntensity(np, effectiveFtp);
  const tss = computeTss(moving, np, effectiveFtp);
  const initials = rider.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <details className="card" style={{ padding: 0 }} open={index === 0}>
    <summary style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", listStyle: "none" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{String(index + 1).padStart(2, "0")}</span>
      <span style={{ width: 34, height: 34, borderRadius: 999, background: "color-mix(in oklab, var(--teal) 24%, white)", display: "grid", placeItems: "center", fontSize: 12 }}>{initials}</span>
      <span style={{ flex: 1 }}><b>{rider.name}</b><span className="mono" style={{ display: "block", color: "var(--ink-3)", fontSize: 11 }}>
        {values.distance_km || "—"} km · {values.moving_seconds || "—"} · {rider.activityName}
      </span></span>
      <span aria-hidden style={{ color: "var(--ink-3)" }}>⌄</span>
    </summary>
    <div style={{ borderTop: "1px solid var(--line)", padding: "2px 14px 16px" }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "12px 0", fontSize: 13 }}>
        <input type="checkbox" checked readOnly /> Mori pjesë
      </label>
      {METRIC_GROUPS.map((group) => <div key={group.key} style={{ marginTop: 14 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>{group.label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(122px, 1fr))", gap: 10 }}>
          {RIDE_METRIC_FIELDS.filter((field) => field.group === group.key).map((field) =>
            field.computed ? <ComputedField key={field.key} field={field} value={field.key === "tss" ? tss : intensity} /> :
              <MetricInput key={field.key} field={field} value={values[field.key] ?? ""} onChange={(value) => setField(field.key, value)} />)}
          {group.key === "power" && <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={setFtp} disabled={!values.ftp_w} onChange={(event) => onSetFtp(event.target.checked)} /> Vendos FTP-në në profil
          </label>}
        </div>
      </div>)}
    </div>
  </details>;
}

function MetricInput({ field, value, onChange }: { field: MetricField; value: string; onChange: (value: string) => void }) {
  return <label className="field" style={{ margin: 0, gap: 4 }}>
    <span style={{ display: "flex", justifyContent: "space-between" }}><span>{field.label}</span><span style={{ fontSize: 9, color: "var(--slate)" }}>{field.unit}</span></span>
    <NumericInput kind={field.ui === "duration" ? "duration" : field.kind === "num" ? "decimal" : "int"}
      value={value} onChange={onChange} placeholder={field.placeholder} hint={field.hint} ariaLabel={field.label} />
  </label>;
}

function ComputedField({ field, value }: { field: MetricField; value: number | null }) {
  return <label className="field" style={{ margin: 0, gap: 4 }}>
    <span>{field.label} <small style={{ color: "var(--ink-3)" }}>automatik</small></span>
    <input value={value ?? "—"} readOnly style={{ background: "var(--paper)" }} />
  </label>;
}
