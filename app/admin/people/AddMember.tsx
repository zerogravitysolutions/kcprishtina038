"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
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

  return (
    <>
      <button type="button" className="btn btn-ember" onClick={() => setOpen(true)}>+ Krijo llogari</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Krijo llogari">
        <form onSubmit={submit}>
          <div className="people-account-form">
            <div className="field" style={{ margin: 0 }}>
              <label>Emri i plotë</label>
              <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Filan Fisteku" autoComplete="off" autoCapitalize="words" required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Email</label>
              <input type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="emri@kcprishtina038.cc" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Fjalëkalimi (min. 8)</label>
              <input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="fjalëkalim fillestar" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Roli</label>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <p className="people-form-note">
            Llogaria krijohet aktive. Për ta shfaqur personin te Ekipi, shtoje edhe në ekip.
          </p>
          <div className="people-form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>Mbyll</button>
            <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke krijuar…" : "Krijo llogarinë"}</button>
          </div>
          {ok && <div className="mm-msg ok">✓ Llogaria u krijua.</div>}
          {err && <div className="mm-msg err">{err}</div>}
        </form>
      </Modal>
    </>
  );
}
