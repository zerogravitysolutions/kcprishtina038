"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login, requestPasswordReset } from "./actions";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    start(async () => {
      const result = await login(email, password);
      if (!result.ok) { setError(result.error); return; }
      const dest = next && next.startsWith("/") ? next : (result.role === "member" ? "/portal" : "/admin/dashboard");
      router.push(dest as never);
      router.refresh();
    });
  };

  const onForgot = async () => {
    const email = prompt("Email-i juaj?");
    if (!email) return;
    const result = await requestPasswordReset(email);
    alert(result.ok
      ? "Email për resetim u dërgua. Kontrolloni inboxin."
      : "Gabim: " + result.error);
  };

  return (
    <form onSubmit={onSubmit}>
      {error && (
        <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, fontSize: 13, background: "color-mix(in oklab, #C25A2D 12%, white)", color: "#9B4220", border: "1px solid color-mix(in oklab, #C25A2D 28%, transparent)" }}>
          {error}
        </div>
      )}

      <div className="field">
        <label>Email</label>
        <input type="email" name="email" placeholder="emri@email.com" autoComplete="email" required />
      </div>

      <div className="field">
        <label>
          Fjalëkalimi
          <a href="#" tabIndex={-1} onClick={(e) => { e.preventDefault(); onForgot(); }}>Harruat fjalëkalimin?</a>
        </label>
        <input type="password" name="password" placeholder="••••••••" autoComplete="current-password" required minLength={6} />
      </div>

      <div className="row">
        <label>
          <input type="checkbox" defaultChecked /> Më mbaj të kyçur
        </label>
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--ink-3)" }}>SSL · Supabase Auth</span>
      </div>

      <button className="btn btn-ember btn-primary" type="submit" disabled={pending}>
        {pending ? "Po hyn…" : "Identifikohu"}
        <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
    </form>
  );
}
