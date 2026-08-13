"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMember } from "../actions";

const ROLES: [string, string][] = [
  ["member", "Anëtar"],
  ["coach", "Trajner"],
  ["staff", "Staf"],
  ["editor", "Redaktor"],
  ["admin", "Admin"],
];

const EMPTY = { full_name: "", email: "", password: "", role: "member" };

export function AddMember() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [f, setF] = useState(EMPTY);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    start(async () => {
      const r = await createMember(f);
      if (r.ok) {
        setOk(true);
        setF(EMPTY);
        router.refresh();
        setTimeout(() => { setOk(false); setOpen(false); }, 1100);
      } else {
        setErr(r.error ?? "Krijimi dështoi.");
      }
    });
  }

  if (!open) {
    return <button className="btn btn-ember" onClick={() => setOpen(true)}>+ Krijo llogari</button>;
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Krijo llogari</h3>
        <button className="kicker" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--text-3)" }} onClick={() => setOpen(false)}>Mbyll ✕</button>
      </div>
      <form onSubmit={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Emri i plotë</label>
            <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Filan Fisteku" autoComplete="off" required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Email</label>
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="emri@kcprishtina038.cc" autoComplete="off" required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Fjalëkalimi (min. 8)</label>
            <input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="fjalëkalim fillestar" autoComplete="new-password" required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Roli</label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke krijuar…" : "Krijo llogarinë"}</button>
          {ok && <span style={{ color: "var(--ok)", fontFamily: "var(--font-mono)", fontSize: 12 }}>✓ U krijua</span>}
          {err && <span style={{ color: "var(--err)", fontSize: 12.5 }}>{err}</span>}
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
          Llogaria krijohet aktive — anëtari mund të kyçet menjëherë me këtë email dhe fjalëkalim. Në faqen publike
          “Ekipi” nuk shfaqet derisa t’i shtosh edhe rreshtin e ekipit me “Shto në ekip”.
        </div>
      </form>
    </div>
  );
}
