"use client";

import { useMemo, useState } from "react";

export type MediaOption = {
  id: string;
  storage_path: string;
  filename: string;
  alt?: string | null;
  created_at?: string | null;
};

type SingleProps = {
  name: string;
  options: MediaOption[];
  initial?: string | null;
  label?: string;
  /** Single-select mode (default). Stores one media.id in the hidden input. */
  multiple?: false;
};

type MultiProps = {
  name: string;
  options: MediaOption[];
  /** Initial selection — uuid[]. */
  initial?: string[] | null;
  label?: string;
  /** Multi-select mode. Stores comma-separated uuids in the hidden input. */
  multiple: true;
};

type Props = SingleProps | MultiProps;

/**
 * Unified media picker. Use `multiple={true}` for galleries; default is
 * single-select for cover/logo fields.
 *
 * Form contract:
 *   - single: hidden input named `name`, value = the picked id (or "")
 *   - multi:  hidden input named `name`, value = comma-separated ids
 *
 * Selection is shown by an ember ring + ✓ badge on the picked tile(s).
 * No separate "selected" strip — keeps the UI to one grid.
 */
export function MediaPicker(props: Props) {
  const isMulti = props.multiple === true;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [single, setSingle] = useState<string>(
    !isMulti && typeof props.initial === "string" ? props.initial : "",
  );
  const [multi, setMulti] = useState<string[]>(
    isMulti && Array.isArray(props.initial) ? props.initial : [],
  );
  const [filter, setFilter] = useState("");
  const [showCount, setShowCount] = useState(80);

  const sorted = useMemo(() => {
    return [...props.options].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
  }, [props.options]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return sorted;
    return sorted.filter((o) => {
      const hay = `${o.filename} ${o.alt ?? ""} ${o.storage_path}`.toLowerCase();
      return f.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [filter, sorted]);

  const visible = filtered.slice(0, showCount);

  function isSelected(id: string): boolean {
    return isMulti ? multi.includes(id) : single === id;
  }

  function toggle(id: string) {
    if (isMulti) {
      setMulti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    } else {
      setSingle((cur) => (cur === id ? "" : id));
    }
  }

  function clearSelection() {
    if (isMulti) setMulti([]);
    else setSingle("");
  }

  const selectedCount = isMulti ? multi.length : single ? 1 : 0;
  const label = props.label ?? (isMulti ? "Galeria" : "Imazh");
  const hiddenValue = isMulti ? multi.join(",") : single;

  return (
    <div className="field">
      <label>
        {label}
        {isMulti && <span style={{ marginLeft: 8, color: "var(--ember)", fontSize: 11 }}>({selectedCount})</span>}
      </label>
      <input type="hidden" name={props.name} value={hiddenValue} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Kërko (emri, alt, ose datë si '2025')..."
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setShowCount(80); }}
          style={{ flex: "1 1 240px", minWidth: 240 }}
        />
        {selectedCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearSelection}
            title="Hiq të gjitha"
          >
            Pastro {isMulti ? `(${selectedCount})` : ""}
          </button>
        )}
      </div>

      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em", marginBottom: 8 }}>
        {filter
          ? `${visible.length}/${filtered.length} rezultate · më të rejat më parë`
          : `Më të rejat ${visible.length}/${props.options.length} · radhitur sipas datës`}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 10,
          maxHeight: 480,
          overflowY: "auto",
          padding: 10,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 8,
        }}
      >
        {visible.map((o) => {
          const selected = isSelected(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              title={o.alt || o.filename}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                padding: 0,
                background: "var(--paper-2)",
                border: selected ? "3px solid var(--ember)" : "1px solid var(--line)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: "pointer",
                transition: "transform .15s",
              }}
            >
              {/* The img must be absolutely positioned so the parent's
                  aspect-ratio actually constrains the box (without this
                  the img's natural size can stretch the row). */}
              <img
                src={`${supaUrl}/storage/v1/object/public/media/${o.storage_path}`}
                alt=""
                loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {selected && (
                <span
                  style={{
                    position: "absolute",
                    top: 6, right: 6,
                    width: 22, height: 22,
                    background: "var(--ember)",
                    color: "var(--paper)",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,.25)",
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length > visible.length && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          onClick={() => setShowCount((c) => c + 80)}
        >
          Ngarko {Math.min(80, filtered.length - visible.length)} të tjera ({filtered.length - visible.length} mbeten)
        </button>
      )}

      <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
        Kliko foton për ta {isMulti ? "shtuar ose hequr nga galeria" : "zgjedhur"}.
      </p>
    </div>
  );
}
