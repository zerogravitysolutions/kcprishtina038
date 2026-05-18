"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setEventCategories } from "./actions";
import { CATEGORIES } from "@/lib/race-category";

export type ExistingCategory = {
  id: string;
  name: string;
  max_riders: number | null;
  display_order: number;
};

export function CategoriesEditor({
  eventId,
  categories,
}: {
  eventId: string;
  categories: ExistingCategory[];
}) {
  // Seed from existing rows. Match by canonical label so older free-text rows
  // that happened to use the same label survive the switch.
  const initial = useMemo(() => {
    const have = new Set(categories.map((c) => c.name));
    const s: Record<string, boolean> = {};
    for (const def of CATEGORIES) s[def.v] = have.has(def.label);
    return s;
  }, [categories]);

  const [state, setState] = useState<Record<string, boolean>>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Guard the auto-save so we don't fire on first render (initial mount).
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const rows = CATEGORIES
      .filter((c) => state[c.v])
      .map((c, idx) => ({ name: c.label, max_riders: null, display_order: idx }));
    setMsg(null);
    let timer: ReturnType<typeof setTimeout> | null = null;
    start(async () => {
      const r = await setEventCategories(eventId, rows);
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error ?? "Gabim" });
      if (r.ok) {
        timer = setTimeout(() => setMsg(null), 1200);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, eventId]);

  function toggle(v: string) {
    setState((s) => ({ ...s, [v]: !s[v] }));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {CATEGORIES.map((c) => {
          const on = state[c.v] ?? false;
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
                gridTemplateColumns: "auto 1fr",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                background: on ? "var(--paper)" : "var(--paper-2)",
                border: on ? "1px solid var(--ember)" : "1px solid var(--line)",
                borderRadius: 8,
                cursor: "pointer",
                transition: "border-color .15s, background .15s",
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--ink)",
              }}
            >
              <input
                type="checkbox"
                checked={on}
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
            </label>
          );
        })}
      </div>

      <div
        className="mono"
        style={{ fontSize: 11, color: msg?.ok === false ? "var(--err)" : "var(--ink-3)", minHeight: 16 }}
      >
        {pending ? "Duke ruajtur…" : msg?.text ?? ""}
      </div>
    </div>
  );
}
