"use client";

import { useState, useTransition } from "react";
import { registerForEvent } from "./actions";

export function RegisterForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await registerForEvent(slug, fd);
          if (r.ok) {
            setMsg({ ok: true, text: "U regjistrove! Të dhënat tua i ke dërguar te klubi — të kontaktojmë me detajet." });
            (e.target as HTMLFormElement).reset();
          } else {
            setMsg({ ok: false, text: r.error });
          }
        });
      }}
      style={{ display: "grid", gap: 14, maxWidth: 720 }}
    >
      <input
        type="text"
        name="_gotcha"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: -9999, width: 1, height: 1 }}
      />

      {msg && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: msg.ok ? "color-mix(in oklab, var(--ok) 12%, transparent)" : "color-mix(in oklab, var(--err) 12%, transparent)",
            color: msg.ok ? "var(--ok)" : "var(--err)",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-name">Emri i plotë *</label>
          <input id="r-name" name="full_name" type="text" required placeholder="P.sh. Albion Ymeri" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-dob">Data e lindjes</label>
          <input id="r-dob" name="dob" type="date" max={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-email">Email *</label>
          <input id="r-email" name="email" type="email" required placeholder="ti@email.com" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-phone">Telefon</label>
          <input id="r-phone" name="phone" type="tel" placeholder="+383 4_ ___ ___" />
        </div>
      </div>

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-category">Kategoria</label>
          <select id="r-category" name="category" defaultValue="">
            <option value="">— Zgjedh —</option>
            <option value="elite_m">Elite M</option>
            <option value="elite_w">Elite W</option>
            <option value="u23">U23</option>
            <option value="junior">Junior</option>
            <option value="masters">Masters</option>
            <option value="amateur">Amator</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-club">Klubi</label>
          <input id="r-club" name="club" type="text" placeholder="KÇ Prishtina 038" />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="r-notes">Shënim (opsionale)</label>
        <textarea id="r-notes" name="notes" rows={3} placeholder="Diçka që duhet të dimë" />
      </div>

      <div>
        <button type="submit" className="btn btn-ember" disabled={pending}>
          <span>{pending ? "Duke regjistruar…" : "Regjistrohu për garën"}</span>
          {!pending && (
            <svg className="arrow" viewBox="0 0 14 14" fill="none">
              <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
