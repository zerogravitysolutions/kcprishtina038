"use client";

import { useState, useMemo } from "react";

export type MediaOption = { id: string; storage_path: string; filename: string };

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
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return options.slice(0, 60);
    return options.filter(o => o.filename.toLowerCase().includes(f) || o.storage_path.toLowerCase().includes(f)).slice(0, 60);
  }, [filter, options]);

  const selected = options.find(o => o.id === value);

  return (
    <div className="field">
      <label>{label}</label>
      <input type="hidden" name={name} value={value} />
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 120, height: 120, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {selected
            ? <img src={`${supaUrl}/storage/v1/object/public/media/${selected.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".12em" }}>Pa imazh</span>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="search"
            placeholder="Kërko imazhin..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ width: "100%" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 6, maxHeight: 220, overflowY: "auto", padding: 6, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 6 }}>
            <button
              type="button"
              onClick={() => setValue("")}
              style={{ aspectRatio: "1", border: value === "" ? "2px solid var(--ember)" : "1px solid var(--line)", borderRadius: 4, background: "var(--white)", color: "var(--ink-3)", fontSize: 10, fontFamily: "var(--font-mono)", cursor: "pointer" }}
            >NONE</button>
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => setValue(o.id)}
                title={o.filename}
                style={{ aspectRatio: "1", padding: 0, border: value === o.id ? "2px solid var(--ember)" : "1px solid var(--line)", borderRadius: 4, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer" }}
              >
                <img src={`${supaUrl}/storage/v1/object/public/media/${o.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
              </button>
            ))}
          </div>
          {options.length > 60 && (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em" }}>
              Duke shfaqur {filtered.length} nga {options.length}. Përdor kërkimin për të kufizuar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
