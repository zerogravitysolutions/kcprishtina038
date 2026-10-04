"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteTeamMember } from "../team-members/actions";
import { AddToRoster } from "./AddToRoster";
import { CreateAccount } from "./CreateAccount";
import {
  setMemberStatus, deleteMember, updateMemberEmail, updateMemberPassword,
  sendPasswordReset, generateResetLink,
} from "../actions";

type Msg = { ok: boolean; text: string } | null;

// Albanian display names for the stored statuses (values stay raw).
const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  inactive: "Joaktiv",
  suspended: "Pezulluar",
  pending: "Në pritje",
};

type Account = { id: string; email: string; status: string; role: string; isSelf: boolean };
type Roster = { id: string; name: string };

export function PeopleRowActions({ name, account, roster, canEditRoster, canManageAccounts }: {
  name: string; account: Account | null; roster: Roster | null;
  canEditRoster: boolean; canManageAccounts: boolean;
}) {
  const id = account?.id ?? "";
  const email = account?.email ?? "";
  const status = account?.status ?? "";
  const isSelf = account?.isSelf ?? false;
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteRosterOpen, setDeleteRosterOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [emailVal, setEmailVal] = useState(email);
  const [pwVal, setPwVal] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<Record<string, Msg>>({});
  // Set when the delete was refused because the member has accounting history.
  // Its own dialog, not an alert(): the admin needs to read a reason and then
  // do the other thing, so the alternative is a button right there.
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const active = status === "active";
  const teamActions = !!roster && canEditRoster;
  const createAction = !!roster && !account && canManageAccounts;
  const addAction = !!account && !roster && canEditRoster;
  const accountActions = !!account && canManageAccounts;
  const hasActions = teamActions || createAction || addAction || accountActions;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuW = 240;
    const left = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top: r.bottom + 6, left });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); btnRef.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        if (items.length === 0) return;
        e.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1
          : index < 0 ? (e.key === "ArrowDown" ? 0 : items.length - 1)
          : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", close); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !menuRef.current || !btnRef.current) return;
    const anchor = btnRef.current.getBoundingClientRect();
    const height = menuRef.current.getBoundingClientRect().height;
    const top = anchor.bottom + height + 6 <= window.innerHeight - 8
      ? anchor.bottom + 6
      : Math.max(8, anchor.top - height - 6);
    if (pos?.top !== top) { setPos((current) => current ? { ...current, top } : current); return; }
    menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen, pos?.top]);

  useEffect(() => {
    if (!blocked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBlocked(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [blocked]);

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

  // Delete is the one action that can be REFUSED rather than fail: a member with
  // invoices or memberships is accounting history the club keeps. Show the
  // reason and the way out instead of a bare error.
  function removeAccount() {
    setMenuOpen(false);
    if (!confirm(`Fshij përfundimisht “${name}”? Ky veprim s’kthehet — për t’i bllokuar hyrjen pa e fshirë, përdor “Çaktivizo llogarinë”.`)) return;
    start(async () => {
      const r = await deleteMember(id);
      if (r.ok) { router.refresh(); return; }
      if (r.blocked) { setBlocked(r.error ?? "Kjo llogari nuk mund të fshihet sepse ka histori financiare."); return; }
      alert(r.error ?? "Veprimi dështoi.");
    });
  }

  // Offered inside the refusal dialog — the supported way to remove someone who
  // has already been invoiced.
  function deactivateFromBlocked() {
    start(async () => {
      const r = await setMemberStatus(id, "inactive");
      if (r.ok) { setBlocked(null); router.refresh(); }
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

  async function removeRoster() {
    if (!roster) return { ok: false as const, error: "Personi nuk është në ekip." };
    const result = await deleteTeamMember(roster.id);
    if (result.ok) { router.refresh(); return { ok: true as const }; }
    return { ok: false as const, error: result.error ?? "Fshirja nga ekipi dështoi." };
  }

  const M = ({ k }: { k: string }) => msg[k] ? <div className={`mm-msg ${msg[k]!.ok ? "ok" : "err"}`}>{msg[k]!.ok ? "✓ " : ""}{msg[k]!.text}</div> : null;

  return (
    <>
      {hasActions ? (
        <button ref={btnRef} type="button" className="kebab" aria-label={`Veprime për ${name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
        </button>
      ) : <span aria-label="Nuk ka veprime">—</span>}

      {menuOpen && mounted && pos && createPortal(
        <>
          <div className="kebab-backdrop" onClick={() => setMenuOpen(false)} />
          <div ref={menuRef} className="kebab-menu people-row-menu" role="menu" aria-label={`Veprime për ${name}`} style={{ top: pos.top, left: pos.left }}>
            {teamActions && roster && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); router.push(`/admin/team-members/${roster.id}`); }}>
                Ndrysho në ekip
              </button>
            )}
            {createAction && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setCreateOpen(true); }}>
                Krijo llogari
              </button>
            )}
            {addAction && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setAddOpen(true); }}>
                Shto në ekip
              </button>
            )}
            {accountActions && (
              <>
                {(teamActions || createAction || addAction) && <div className="sep" />}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setModalOpen(true); }}>
                  Ndrysho email / fjalëkalim
                </button>
                {!isSelf && (
                  <button type="button" role="menuitem" disabled={pending} onClick={() => quick(() => setMemberStatus(id, active ? "inactive" : "active"))}>
                    {active ? "Çaktivizo llogarinë" : "Aktivizo llogarinë"}
                  </button>
                )}
              </>
            )}
            {(teamActions || (accountActions && !isSelf)) && <div className="sep" />}
            {teamActions && (
              <button type="button" role="menuitem" className="danger" onClick={() => { setMenuOpen(false); setDeleteRosterOpen(true); }}>
                Fshij nga ekipi
              </button>
            )}
            {accountActions && !isSelf && (
              <button type="button" role="menuitem" className="danger" disabled={pending} onClick={removeAccount}>
                Fshij llogarinë
              </button>
            )}
          </div>
        </>,
        document.body,
      )}

      {createAction && roster && (
        <CreateAccount teamMemberId={roster.id} name={name} open={createOpen} onClose={() => setCreateOpen(false)} />
      )}
      {addAction && account && (
        <AddToRoster profileId={account.id} name={name} role={account.role} open={addOpen} onClose={() => setAddOpen(false)} />
      )}
      {teamActions && roster && (
        <ConfirmModal
          open={deleteRosterOpen}
          onClose={() => setDeleteRosterOpen(false)}
          title="Fshij nga ekipi"
          tone="danger"
          confirmLabel="Fshij"
          message={<>Sigurt që do ta fshish <strong>{roster.name}</strong> nga ekipi?</>}
          onConfirm={removeRoster}
        />
      )}

      {blocked && mounted && createPortal(
        <div className="mm-backdrop" onClick={() => setBlocked(null)}>
          <div className="mm-panel" role="alertdialog" aria-label={`Fshirja e ${name} nuk lejohet`} onClick={(e) => e.stopPropagation()}>
            <div className="mm-head">
              <div>
                <div className="nm">Llogaria nuk fshihet</div>
                <div className="em">{name} · {email}</div>
              </div>
              <button type="button" className="mm-x" aria-label="Mbyll" onClick={() => setBlocked(null)}>✕</button>
            </div>

            <div className="mm-sec">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-2)" }}>{blocked}</p>
            </div>

            <div className="mm-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm" onClick={() => setBlocked(null)}>Mbyll</button>
              {/* Anything but 'inactive' can still be deactivated — a 'pending'
                  or 'suspended' account is not yet cut off the same way. */}
              {status !== "inactive" && (
                <button type="button" className="btn btn-sm" disabled={pending} onClick={deactivateFromBlocked}>
                  Çaktivizo llogarinë
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {modalOpen && mounted && createPortal(
        <div className="mm-backdrop" onClick={() => setModalOpen(false)}>
          <div className="mm-panel" role="dialog" aria-label={`Menaxho ${name}`} onClick={(e) => e.stopPropagation()}>
            <div className="mm-head">
              <div>
                <div className="nm">{name}</div>
                <div className="em">{email} · {STATUS_LABEL[status] ?? status}</div>
              </div>
              <button type="button" className="mm-x" aria-label="Mbyll" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="mm-sec">
              <h4>Ndrysho email-in</h4>
              <div className="mm-row">
                <input type="email" inputMode="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <button type="button" className="btn btn-sm" disabled={pending || emailVal.trim().toLowerCase() === email.toLowerCase()} onClick={() => run("email", () => updateMemberEmail(id, emailVal), "Email-i u ndryshua.")}>Ruaj</button>
              </div>
              <M k="email" />
            </div>

            <div className="mm-sec">
              <h4>Vendos fjalëkalim të ri</h4>
              <div className="mm-row">
                <input type="text" value={pwVal} onChange={(e) => setPwVal(e.target.value)} placeholder="min. 8 karaktere" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <button type="button" className="btn btn-sm" disabled={pending || pwVal.length < 8} onClick={() => run("pw", () => updateMemberPassword(id, pwVal), "Fjalëkalimi u vendos.", () => setPwVal(""))}>Vendos</button>
              </div>
              <M k="pw" />
            </div>

            <div className="mm-sec">
              <h4>Rivendosje e fjalëkalimit</h4>
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
