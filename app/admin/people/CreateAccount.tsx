"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { createAccountForPerson } from "./actions";

const ROLES: [string, string][] = [
  ["member", "Anëtar"],
  ["coach", "Trajner"],
  ["staff", "Staf"],
  ["editor", "Redaktor"],
  ["admin", "Admin"],
];

// No l/1/0/O — the admin reads this out loud when handing it over.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
function suggestPassword(len = 12): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Contextual action for a roster person with no login: create the auth user +
 * profile and link it back through team_members.profile_id. Admin only, both
 * here and in the server action. */
export function CreateAccount({ teamMemberId, name }: { teamMemberId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setEmail("");
    setRole("member");
    setPassword(suggestPassword());
  }, [open]);

  function submit() {
    setErr(null);
    start(async () => {
      const r = await createAccountForPerson({ teamMemberId, email, password, role });
      if (r.ok) { setOpen(false); router.refresh(); }
      else setErr(r.error ?? "Krijimi i llogarisë dështoi.");
    });
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Krijo llogari
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Krijo llogari për ${name}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Anulo
            </button>
            <button type="button" className="btn btn-ember btn-sm" onClick={submit} disabled={pending || !email.trim()}>
              {pending ? "Duke krijuar…" : "Krijo"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field">
            <label>Email</label>
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="emri@kcprishtina038.cc" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          </div>
          <div className="field">
            <label>Fjalëkalimi fillestar (min. 8)</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          </div>
          <div className="field">
            <label>Roli</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Llogaria krijohet aktive dhe lidhet me këtë person në ekip. Nëse ky email ka tashmë llogari, ajo vetëm
            lidhet — fjalëkalimi nuk ndryshon.
          </div>
          {err && <div style={{ color: "var(--err)", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        </form>
      </Modal>
    </>
  );
}
