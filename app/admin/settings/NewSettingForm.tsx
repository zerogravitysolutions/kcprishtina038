"use client";

import { useTransition, useState } from "react";
import { upsertSetting } from "./actions";

export function NewSettingForm() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          try { await upsertSetting(fd); form.reset(); }
          catch (x) {
            const msg = x instanceof Error ? x.message : String(x);
            if (!msg.toLowerCase().includes("next_redirect")) setErr(msg);
            else form.reset();
          }
        });
      }}
      style={{ display: "grid", gridTemplateColumns: "240px 1fr 120px", gap: 12, alignItems: "start", marginBottom: 18, padding: 14, background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12 }}
    >
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Çelësi</label>
        <input name="key" required placeholder="my_key" pattern="^[a-z][a-z0-9_]*$" />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Vlera (JSON ose tekst)</label>
        <textarea name="value" rows={3} placeholder={'"tekst" ose 42 ose {"foo":"bar"}'} />
      </div>
      <div style={{ alignSelf: "end" }}>
        <button type="submit" className="btn btn-ember" disabled={pending} style={{ width: "100%" }}>{pending ? "Duke shtuar…" : "Shto"}</button>
      </div>
      {err && <div style={{ gridColumn: "1 / -1", color: "var(--err)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{err}</div>}
    </form>
  );
}
