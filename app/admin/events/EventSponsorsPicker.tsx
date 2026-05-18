"use client";

import { useMemo, useState, useTransition } from "react";
import { setEventSponsors } from "./actions";

export type SponsorOption = { id: string; name: string; tier: string };

export function EventSponsorsPicker({
  eventId,
  sponsors,
  initialSelected,
}: {
  eventId: string;
  sponsors: SponsorOption[];
  initialSelected: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const byId = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const available = sponsors.filter((s) => !selectedSet.has(s.id));

  function add(id: string) {
    setMsg(null);
    setSelected((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }
  function remove(id: string) {
    setMsg(null);
    setSelected((cur) => cur.filter((x) => x !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setSelected((cur) => {
      const idx = cur.indexOf(id);
      if (idx < 0) return cur;
      const next = idx + dir;
      if (next < 0 || next >= cur.length) return cur;
      const copy = [...cur];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }
  function save() {
    setMsg(null);
    start(async () => {
      const r = await setEventSponsors(eventId, selected);
      setMsg(r.ok ? { ok: true, text: "Ruajtur ✓" } : { ok: false, text: r.error ?? "" });
      if (r.ok) setTimeout(() => setMsg(null), 1500);
    });
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      {selected.length === 0 ? (
        <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          Asnjë sponsor i lidhur me këtë garë. Zgjedh nga lista poshtë.
        </p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {selected.map((id, idx) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", width: 28 }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "var(--ember)",
                  }}
                >
                  {s.tier}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  title="Lart"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(id, 1)}
                  disabled={idx === selected.length - 1}
                  title="Poshtë"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(id)}
                  title="Hiq"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {available.length > 0 && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Shto sponsor</label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) add(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">— Zgjedh —</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.tier}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ruaj sponsorët"}
        </button>
        {msg && (
          <span
            className="mono"
            style={{ fontSize: 12, color: msg.ok ? "var(--ok)" : "var(--err)" }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
