"use client";
import { useState, useTransition } from "react";
import { changePassword } from "./password-actions";

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const current = String(fd.get("current-pw") ?? "");
    const next = String(fd.get("new-pw") ?? "");
    if (next !== String(fd.get("new-pw-confirm") ?? "")) { setMsg({ ok: false, text: "Fjalëkalimet e reja nuk përputhen." }); return; }
    setMsg(null);
    start(async () => {
      const result = await changePassword(current, next);
      if (!result.ok) { setMsg({ ok: false, text: result.error }); return; }
      form.reset();
      setMsg({ ok: true, text: "Fjalëkalimi u ndryshua. Përdore herën tjetër që identifikohesh." });
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="current-pw">Fjalëkalimi aktual</label>
        <input id="current-pw" type="password" name="current-pw" required autoComplete="current-password" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label htmlFor="new-pw">Fjalëkalimi i ri</label>
          <input id="new-pw" type="password" name="new-pw" minLength={8} required autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="new-pw-confirm">Konfirmo fjalëkalimin e ri</label>
          <input id="new-pw-confirm" type="password" name="new-pw-confirm" minLength={8} required autoComplete="new-password" />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 20, paddingTop: 20, borderTop: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)" }}>
        <span role="status" style={{ fontSize: 13, color: msg ? (msg.ok ? "var(--ok, #2f8a4e)" : "var(--ember-deep)") : "var(--ink-3)" }}>
          {msg?.text ?? "Së paku 8 karaktere."}
        </span>
        <button className="btn btn-ember" type="submit" disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ndrysho fjalëkalimin"}
        </button>
      </div>
    </form>
  );
}
