"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "./actions";

export function ResetForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("new-pw") ?? "");
    const pw2 = String(fd.get("new-pw-confirm") ?? "");
    if (pw !== pw2) { setMsg({ kind: "err", text: "Fjalëkalimet nuk përputhen." }); return; }
    start(async () => {
      const result = await updatePassword(pw);
      if (!result.ok) { setMsg({ kind: "err", text: "Gabim: " + result.error }); return; }
      setMsg({ kind: "ok", text: "Fjalëkalimi u ndryshua. Po të ridrejtojmë te identifikimi…" });
      setTimeout(() => router.push("/login"), 1500);
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="field" style={{ marginTop: 20 }}>
        <label>Fjalëkalimi i ri</label>
        <input type="password" name="new-pw" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>Konfirmo fjalëkalimin</label>
        <input type="password" name="new-pw-confirm" minLength={8} required autoComplete="new-password" />
      </div>
      <button className="btn btn-ember" type="submit" disabled={pending} style={{ width: "100%", justifyContent: "center", marginTop: 22 }}>
        <span>{pending ? "Duke ruajtur…" : "Ruaj fjalëkalimin"}</span>
        <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {msg && (
        <div style={{
          marginTop: 16, padding: "10px 12px", borderRadius: 8, fontSize: 13,
          background: msg.kind === "ok" ? "color-mix(in oklab,#6FAAA8 18%,white)" : "color-mix(in oklab,var(--ember) 12%,white)",
          color: msg.kind === "ok" ? "#0F1A2E" : "var(--ember-deep)",
          border: `1px solid ${msg.kind === "ok" ? "color-mix(in oklab,#6FAAA8 36%,transparent)" : "color-mix(in oklab,var(--ember) 28%,transparent)"}`
        }}>
          {msg.text}
        </div>
      )}
    </form>
  );
}
