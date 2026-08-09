"use client";

import { useMemo, useState } from "react";

export type AthleteOption = {
  id: string;
  full_name: string;
  section_slug: string | null;
  gender: "m" | "f" | null;
};

/**
 * Selectable list of athletes. `mode="single"` behaves like radio (picking one
 * clears the rest); `mode="multi"` toggles. Controlled via value/onChange.
 */
export function AthletePicker({
  athletes,
  value,
  onChange,
  mode = "multi",
  exclude = [],
}: {
  athletes: AthleteOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  mode?: "multi" | "single";
  exclude?: string[];
}) {
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const ex = new Set(exclude);
    const q = query.trim().toLowerCase();
    return athletes
      .filter((a) => !ex.has(a.id))
      .filter((a) => (q ? a.full_name.toLowerCase().includes(q) : true));
  }, [athletes, exclude, query]);

  function toggle(id: string) {
    if (mode === "single") {
      onChange(value.includes(id) ? [] : [id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const selected = new Set(value);

  return (
    <div style={{ border: "1px solid var(--line-strong)", borderRadius: 10, background: "var(--white)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
        <input
          type="search"
          aria-label="Kërko çiklist"
          placeholder="Kërko çiklist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="athlete-search"
        />
        {mode === "multi" && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(Array.from(new Set([...value, ...list.map((a) => a.id)])))}>
              Zgjidh të gjithë
            </button>
            {value.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Pastro</button>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, maxHeight: 260, overflowY: "auto" }}>
        {list.length === 0 ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: 8 }}>Asnjë çiklist.</div>
        ) : (
          list.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className="athlete-chip"
                onClick={() => toggle(a.id)}
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
                  width: 16, height: 16, borderRadius: mode === "single" ? "50%" : 4, flexShrink: 0,
                  border: `1.5px solid ${on ? "var(--ember)" : "var(--slate)"}`,
                  background: on ? "var(--ember)" : "transparent",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11,
                }}>{on ? "✓" : ""}</span>
                {a.full_name}
              </button>
            );
          })
        )}
      </div>
      {mode === "multi" && (
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 10px", borderTop: "1px solid var(--line)", letterSpacing: ".08em" }}>
          {value.length} të zgjedhur
        </div>
      )}
    </div>
  );
}
