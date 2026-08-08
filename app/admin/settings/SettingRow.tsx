"use client";

import { useState, useTransition } from "react";
import { upsertSetting, deleteSetting } from "./actions";

export function SettingRow({ row }: { row: { key: string; value: unknown; updated_at: string } }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(JSON.stringify(row.value, null, 2));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    const fd = new FormData();
    fd.set("key", row.key);
    fd.set("value", value);
    start(async () => {
      try { await upsertSetting(fd); setEditing(false); }
      catch (x) {
        const msg = x instanceof Error ? x.message : String(x);
        if (!msg.toLowerCase().includes("next_redirect")) setErr(msg);
        else setEditing(false);
      }
    });
  }

  function remove() {
    if (!confirm(`Fshij çelësin "${row.key}"?`)) return;
    start(async () => {
      const r = await deleteSetting(row.key);
      if (!r.ok) alert(`Gabim: ${r.error}`);
    });
  }

  return (
    <tr>
      <td className="mono" style={{ verticalAlign: "top" }}>{row.key}</td>
      <td style={{ verticalAlign: "top", maxWidth: 500 }}>
        {editing ? (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={Math.min(10, Math.max(2, value.split("\n").length))}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, padding: 8, border: "1px solid var(--line-strong)", borderRadius: 6, background: "var(--white)", color: "var(--ink)" }}
          />
        ) : (
          <pre className="mono" style={{ fontSize: 12, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(row.value, null, 2)}</pre>
        )}
        {err && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4, fontFamily: "var(--font-mono)" }}>{err}</div>}
      </td>
      <td className="mono" style={{ verticalAlign: "top" }}>{new Date(row.updated_at).toLocaleDateString("sq")}</td>
      <td className="actions" style={{ verticalAlign: "top" }}>
        {editing ? (
          <>
            <button type="button" className="btn btn-ember btn-sm" disabled={pending} onClick={save}>{pending ? "Duke ruajtur…" : "Ruaj"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setEditing(false); setValue(JSON.stringify(row.value, null, 2)); }}>Anulo</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Ndrysho</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={remove} style={{ color: "var(--err)" }}>Fshij</button>
          </>
        )}
      </td>
    </tr>
  );
}
