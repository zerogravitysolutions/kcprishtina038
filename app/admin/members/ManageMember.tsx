"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  setMemberStatus, deleteMember, updateMemberEmail, updateMemberPassword,
  sendPasswordReset, generateResetLink,
} from "../actions";

type Msg = { ok: boolean; text: string } | null;

export function ManageMember({ id, name, email, status, isSelf }: { id: string; name: string; email: string; status: string; isSelf: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);

  const [emailVal, setEmailVal] = useState(email);
  const [pwVal, setPwVal] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<Record<string, Msg>>({});

  useEffect(() => setMounted(true), []);

  const active = status === "active";

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuW = 216;
    const left = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top: r.bottom + 6, left });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menuOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    setEmailVal(email); setPwVal(""); setLink(null); setCopied(false); setMsg({});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [modalOpen, email]);

  // Quick action from the menu (deactivate / delete): run, refresh, alert on error.
  function quick(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMenuOpen(false);
    start(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else alert(r.error ?? "Veprimi dështoi.");
    });
  }

  // Credential action from the modal (email / password / reset): inline feedback.
  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) {
    start(async () => {
      setMsg((m) => ({ ...m, [key]: null }));
      const r = await fn();
      setMsg((m) => ({ ...m, [key]: { ok: r.ok, text: r.ok ? okText : (r.error ?? "Dështoi.") } }));
      if (r.ok) { after?.(); router.refresh(); }
    });
  }

  function genLink() {
    start(async () => {
      setMsg((m) => ({ ...m, reset: null })); setLink(null); setCopied(false);
      const r = await generateResetLink(email);
      if (r.ok && r.link) { setLink(r.link); setMsg((m) => ({ ...m, reset: { ok: true, text: "Lidhja u gjenerua — kopjoje dhe dërgoja anëtarit." } })); }
      else setMsg((m) => ({ ...m, reset: { ok: false, text: r.error ?? "Dështoi." } }));
    });
  }

  const M = ({ k }: { k: string }) => msg[k] ? <div className={`mm-msg ${msg[k]!.ok ? "ok" : "err"}`}>{msg[k]!.ok ? "✓ " : ""}{msg[k]!.text}</div> : null;

  return (
    <>
      <button ref={btnRef} type="button" className="kebab" aria-label={`Veprime për ${name}`} aria-haspopup="menu" onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
      </button>

      {menuOpen && mounted && pos && createPortal(
        <>
          <div className="kebab-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="kebab-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
            <button role="menuitem" onClick={() => { setMenuOpen(false); setModalOpen(true); }}>
              <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              Ndrysho email / fjalëkalim
            </button>
            {!isSelf && <div className="sep" />}
            {!isSelf && (
              <button role="menuitem" disabled={pending} onClick={() => quick(() => setMemberStatus(id, active ? "inactive" : "active"))}>
                <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18.4 6.6A9 9 0 1 1 12 3" /><path d="M12 3v6" /></svg>
                {active ? "Çaktivizo llogarinë" : "Aktivizo llogarinë"}
              </button>
            )}
            {!isSelf && (
              <button role="menuitem" className="danger" disabled={pending} onClick={() => {
                if (!confirm(`Fshi përfundimisht "${name}"? Kjo s'kthehet — për të bllokuar hyrjen pa fshirë, përdor "Çaktivizo".`)) return;
                quick(() => deleteMember(id));
              }}>
                <svg className="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
                Fshij llogarinë
              </button>
            )}
          </div>
        </>,
        document.body,
      )}

      {modalOpen && mounted && createPortal(
        <div className="mm-backdrop" onClick={() => setModalOpen(false)}>
          <div className="mm-panel" role="dialog" aria-label={`Menaxho ${name}`} onClick={(e) => e.stopPropagation()}>
            <div className="mm-head">
              <div>
                <div className="nm">{name}</div>
                <div className="em">{email} · {status}</div>
              </div>
              <button type="button" className="mm-x" aria-label="Mbyll" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="mm-sec">
              <h4>Ndrysho email-in</h4>
              <div className="mm-row">
                <input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} autoComplete="off" />
                <button type="button" className="btn btn-sm" disabled={pending || emailVal.trim().toLowerCase() === email.toLowerCase()} onClick={() => run("email", () => updateMemberEmail(id, emailVal), "Email-i u ndryshua.")}>Ruaj</button>
              </div>
              <M k="email" />
            </div>

            <div className="mm-sec">
              <h4>Vendos fjalëkalim të ri</h4>
              <div className="mm-row">
                <input type="text" value={pwVal} onChange={(e) => setPwVal(e.target.value)} placeholder="min. 8 karaktere" autoComplete="new-password" />
                <button type="button" className="btn btn-sm" disabled={pending || pwVal.length < 8} onClick={() => run("pw", () => updateMemberPassword(id, pwVal), "Fjalëkalimi u vendos.", () => setPwVal(""))}>Vendos</button>
              </div>
              <M k="pw" />
            </div>

            <div className="mm-sec">
              <h4>Lidhje reset-i</h4>
              <div className="mm-row">
                <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run("reset", () => sendPasswordReset(email), "Email-i me lidhje u dërgua.")}>Dërgo email</button>
                <button type="button" className="btn btn-sm" disabled={pending} onClick={genLink}>Gjenero lidhje</button>
              </div>
              {link && (
                <div className="mm-link">
                  <code title={link}>{link}</code>
                  <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "U kopjua ✓" : "Kopjo"}</button>
                </div>
              )}
              <M k="reset" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
