"use client";

import { useMemo, useState, useTransition } from "react";
import { setEventCategories } from "./actions";
import { CATEGORIES } from "@/lib/race-category";

export type ExistingCategory = {
  id: string;
  name: string;
  max_riders: number | null;
  display_order: number;
};

type RowState = { enabled: boolean; max: string };

export function CategoriesEditor({
  eventId,
  categories,
}: {
  eventId: string;
  categories: ExistingCategory[];
}) {
  // Seed state from the rows already in the DB. We match by the canonical
  // category label so a category created via the old free-text input still
  // shows as checked here if its name matches.
  const initial = useMemo(() => {
    const byLabel = new Map<string, ExistingCategory>();
    for (const c of categories) byLabel.set(c.name, c);
    const s: Record<string, RowState> = {};
    for (const def of CATEGORIES) {
      const existing = byLabel.get(def.label);
      s[def.v] = {
        enabled: !!existing,
        max: existing?.max_riders != null ? String(existing.max_riders) : "",
      };
    }
    return s;
  }, [categories]);

  const [state, setState] = useState<Record<string, RowState>>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(v: string) {
    setMsg(null);
    setState((s) => ({ ...s, [v]: { ...s[v], enabled: !s[v].enabled } }));
  }
  function setMax(v: string, val: string) {
    setState((s) => ({ ...s, [v]: { ...s[v], max: val } }));
  }

  function save() {
    setMsg(null);
    const rows = CATEGORIES
      .filter((c) => state[c.v]?.enabled)
      .map((c, idx) => {
        const raw = state[c.v].max.trim();
        const max = raw === "" ? null : Number(raw);
        return {
          name: c.label,
          max_riders: Number.isFinite(max as number) ? (max as number) : null,
          display_order: idx,
        };
      });
    start(async () => {
      const r = await setEventCategories(eventId, rows);
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error ?? "Gabim" });
      if (r.ok) setTimeout(() => setMsg(null), 1500);
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 8,
        }}
      >
        {CATEGORIES.map((c) => {
          const row = state[c.v];
          const range =
            c.min != null && c.max != null
              ? `${c.min}–${c.max} vjeç`
              : c.min != null
                ? `${c.min}+ vjeç`
                : "çdo moshë";
          const gender = c.gender === "m" ? "M" : c.gender === "f" ? "F" : null;
          return (
            <label
              key={c.v}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 70px",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                background: row?.enabled ? "var(--paper)" : "var(--paper-2)",
                border: row?.enabled
                  ? "1px solid var(--ember)"
                  : "1px solid var(--line)",
                borderRadius: 8,
                cursor: "pointer",
                transition: "border-color .15s",
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--ink)",
              }}
            >
              <input
                type="checkbox"
                checked={row?.enabled ?? false}
                onChange={() => toggle(c.v)}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {c.label}
                  {gender && (
                    <span
                      className="mono"
                      style={{
                        marginLeft: 6, fontSize: 10, letterSpacing: ".12em",
                        color: "var(--ember)",
                      }}
                    >
                      {gender}
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".08em" }}>
                  {range}
                </div>
              </div>
              <input
                type="number"
                min={0}
                placeholder="Max"
                value={row?.max ?? ""}
                disabled={!row?.enabled}
                onChange={(e) => setMax(c.v, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{ padding: "6px 8px", fontSize: 12 }}
                aria-label={`Max çiklistë — ${c.label}`}
              />
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ruaj kategoritë"}
        </button>
        {msg && (
          <span className="mono" style={{ fontSize: 12, color: msg.ok ? "var(--ok)" : "var(--err)" }}>
            {msg.text}
          </span>
        )}
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
          Max = numri maksimal i çiklistëve për atë kategori (opsionale)
        </span>
      </div>
    </div>
  );
}
