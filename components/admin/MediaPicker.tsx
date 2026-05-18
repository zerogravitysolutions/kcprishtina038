"use client";

import { useState, useMemo } from "react";

export type MediaOption = {
  id: string;
  storage_path: string;
  filename: string;
  alt?: string | null;
  created_at?: string | null;
};

export function MediaPicker({
  name,
  options,
  initial,
  label = "Imazh",
}: {
  name: string;
  options: MediaOption[];
  initial?: string | null;
  label?: string;
}) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [value, setValue] = useState<string>(initial ?? "");
  const [filter, setFilter] = useState("");
  const [showCount, setShowCount] = useState(80);

  // Sort newest first. Callers usually pass options already ordered, but
  // do it again here so the picker is correct even when callers pass an
  // unsorted list.
  const sorted = useMemo(() => {
    return [...options].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
  }, [options]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return sorted;
    return sorted.filter(o => {
      const hay = `${o.filename} ${o.alt ?? ""} ${o.storage_path}`.toLowerCase();
      // Split filter on spaces so a multi-word query is AND'd.
      return f.split(/\s+/).every(t => hay.includes(t));
    });
  }, [filter, sorted]);

  const visible = filtered.slice(0, showCount);
  const selected = options.find(o => o.id === value);

  return (
    <div className="field">
      <label>{label}</label>
      <input type="hidden" name={name} value={value} />
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 160, height: 160, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {selected
            ? <img src={`${supaUrl}/storage/v1/object/public/media/${selected.storage_path}`} alt={selected.alt ?? selected.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".12em" }}>Pa imazh</span>}
        </div>
        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="search"
            placeholder="Kërko (emri, alt, ose data si '2025')..."
            value={filter}
            onChange={e => { setFilter(e.target.value); setShowCount(80); }}
            style={{ width: "100%" }}
          />
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em" }}>
            {filter
              ? `${visible.length}/${filtered.length} rezultate · më të rejat më parë`
              : `Më të rejat ${visible.length}/${options.length} · radhitur sipas datës`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, maxHeight: 360, overflowY: "auto", padding: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setValue("")}
              style={{ aspectRatio: "1", border: value === "" ? "2px solid var(--ember)" : "1px dashed var(--line-strong)", borderRadius: 6, background: "var(--white)", color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: ".06em", cursor: "pointer" }}
            >ASNJË</button>
            {visible.map(o => {
              const isSelected = value === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setValue(o.id)}
                  title={o.alt || o.filename}
                  style={{ aspectRatio: "1", padding: 0, border: isSelected ? "2px solid var(--ember)" : "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer", position: "relative" }}
                >
                  <img src={`${supaUrl}/storage/v1/object/public/media/${o.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                  {isSelected && (
                    <span style={{ position: "absolute", top: 4, right: 4, background: "var(--ember)", color: "var(--paper)", width: 18, height: 18, borderRadius: 999, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
          {filtered.length > visible.length && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowCount(c => c + 80)}>
              Ngarko {Math.min(80, filtered.length - visible.length)} të tjera ({filtered.length - visible.length} mbeten)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
