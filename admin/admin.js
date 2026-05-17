// Shared admin-side helpers. Every admin page imports this as an ES module.
// It complements (does NOT replace) _shell.js — that script renders the chrome
// (sidebar + topbar); this one wires identity + data.

import { supa, requireAuth, signOut, getProfile } from "../assets/supabase.js";

export { supa, signOut };

// Role groups that match the RLS matrix.
export const STAFF_ROLES = ["admin","editor","staff","coach"];
export const ADMIN_ONLY  = ["admin"];

// Page-level guard. Pass an allowlist of roles; defaults to STAFF_ROLES.
// Returns the profile, or redirects + returns null.
export async function requireStaff(allowedRoles = STAFF_ROLES) {
  return await requireAuth({ roles: allowedRoles, redirect: "../login.html" });
}

// ============ DOM helpers ============
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

export function fmtDate(iso, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("sq", opts); }
  catch { return iso; }
}

export function fmtRelative(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)         return "tani";
  if (ms < 3600_000)       return Math.floor(ms / 60_000) + " min më parë";
  if (ms < 86_400_000)     return Math.floor(ms / 3600_000) + " orë më parë";
  if (ms < 7 * 86_400_000) return Math.floor(ms / 86_400_000) + " ditë më parë";
  return new Date(iso).toLocaleDateString("sq", { day: "2-digit", month: "short" });
}

export function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0,2).map(s => s[0] || "").join("").toUpperCase() || "?";
}

// ============ Common UI side-effects ============

// Hides admin-nav items the visitor's role cannot access.
// _shell.js renders the whole nav; we remove what isn't permitted.
export function filterNavByRole(role) {
  const restrictions = {
    // pageId → roles that can SEE it
    settings:     ["admin"],
    staff:        ["admin"],
    applications: ["admin","editor","staff"],
    sponsors:     ["admin","editor"],
    news:         ["admin","editor"],
    media:        ["admin","editor"],
  };
  $$(".side .nav-item").forEach(el => {
    const href = el.getAttribute("href") || "";
    const id = href.replace(".html","");
    const allow = restrictions[id];
    if (allow && !allow.includes(role)) el.style.display = "none";
  });
  // Hide nav-groups whose all items got hidden.
  $$(".side .nav-group").forEach(g => {
    let next = g.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains("nav-group")) {
      if (next.style.display !== "none" && next.classList.contains("nav-item")) hasVisible = true;
      next = next.nextElementSibling;
    }
    if (!hasVisible) g.style.display = "none";
  });
}

// Replace the demo "Shqiponja Pllana / Owner" pill in the sidebar with the real user.
export function patchSidebarIdentity(profile) {
  const avatar = $(".side .me .avatar");
  const who    = $(".side .me .who");
  if (avatar) avatar.textContent = initials(profile.full_name);
  if (who) {
    who.firstChild.textContent = profile.full_name + " ";
    const small = who.querySelector("span");
    if (small) small.textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  }
  // Wire the topbar "View site" link to also work as a sign-out shortcut via right-click is overkill;
  // we'll add a discreet sign-out button next to it instead.
  const actions = $(".top .actions");
  if (actions && !$("#admin-signout")) {
    const btn = document.createElement("button");
    btn.id = "admin-signout";
    btn.className = "btn-icon btn";
    btn.title = "Sign out";
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.addEventListener("click", signOut);
    actions.appendChild(btn);
  }
}

// =====================================================================
// Generic create/edit modal.
//
// openModal({
//   title: "New event",
//   fields: [
//     { name: "title_sq", label: "Title (SQ)", type: "text", required: true },
//     { name: "type",     label: "Type",       type: "select", options: ["race","ride","camp","training"], required: true },
//     { name: "start_at", label: "Start",      type: "datetime-local", required: true },
//     { name: "description_sq", label: "Description", type: "textarea" },
//   ],
//   initial: existingRow,   // optional — pre-fills for edit
//   onSubmit: async (values) => { ... }
// })
//
// Returns a promise that resolves once the modal closes.
// =====================================================================
export function openModal({ title, fields, initial = {}, onSubmit, submitLabel = "Save" }) {
  return new Promise((resolve) => {
    // Backdrop
    const back = document.createElement("div");
    back.style.cssText = `
      position:fixed;inset:0;background:rgba(15,26,46,.55);z-index:200;
      display:flex;align-items:flex-start;justify-content:center;padding:48px 20px;
      overflow-y:auto;
    `;

    // Card
    const card = document.createElement("div");
    card.style.cssText = `
      background:#F4F2EC;border-radius:14px;max-width:640px;width:100%;
      padding:28px 32px 24px;box-shadow:0 24px 60px rgba(15,26,46,.4);
      font-family:'Manrope',sans-serif;
    `;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:22px;letter-spacing:-0.02em;margin:0;">${escapeHtml(title)}</h2>
        <button id="modal-x" style="background:transparent;border:0;font-size:22px;cursor:pointer;color:#2A3858;line-height:1;padding:0 4px;">×</button>
      </div>
      <form id="modal-form">
        ${fields.map(f => fieldHtml(f, initial[f.name])).join("")}
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;border-top:1px solid rgba(15,26,46,.1);padding-top:16px;">
          <button type="button" id="modal-cancel" class="btn btn-ghost btn-sm">Cancel</button>
          <button type="submit" class="btn btn-ember btn-sm">${escapeHtml(submitLabel)}</button>
        </div>
        <div id="modal-err" style="display:none;margin-top:14px;padding:10px 12px;border-radius:8px;background:color-mix(in oklab,#C25A2D 12%,white);color:#9B4220;border:1px solid color-mix(in oklab,#C25A2D 28%,transparent);font-size:13px;"></div>
      </form>
    `;
    back.appendChild(card);
    document.body.appendChild(back);

    const close = () => { back.remove(); resolve(null); };
    card.querySelector("#modal-x").addEventListener("click", close);
    card.querySelector("#modal-cancel").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });

    card.querySelector("#modal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const values = {};
      for (const f of fields) {
        let v = fd.get(f.name);
        if (v === null) v = "";
        v = String(v).trim();
        if (f.type === "number" || f.type === "int")  v = v === "" ? null : Number(v);
        else if (f.type === "json")                    { if (v === "") v = null; else { try { v = JSON.parse(v); } catch { showErr("JSON i pavlefshëm te `" + f.label + "`"); return; } } }
        else if (v === "")                              v = null;
        values[f.name] = v;
      }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      const oldLabel = submitBtn.textContent; submitBtn.textContent = "Po ruan…";
      try {
        await onSubmit(values);
        back.remove();
        resolve(values);
      } catch (err) {
        submitBtn.disabled = false; submitBtn.textContent = oldLabel;
        showErr(err.message || String(err));
      }
    });

    function showErr(msg) {
      const e = card.querySelector("#modal-err");
      e.textContent = msg; e.style.display = "block";
    }
  });
}

function fieldHtml(f, initial) {
  const v = initial === undefined || initial === null ? "" : initial;
  const label = `<label style="display:block;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#2A3858;margin-bottom:6px;">${escapeHtml(f.label)}${f.required ? ' <span style="color:#C25A2D;">*</span>' : ''}</label>`;
  const required = f.required ? "required" : "";
  const baseInput = `width:100%;font-family:'Manrope',sans-serif;font-size:14px;padding:10px 12px;border-radius:8px;border:1px solid rgba(15,26,46,.18);background:white;color:#0F1A2E;`;
  let input;
  if (f.type === "textarea") {
    input = `<textarea name="${escapeHtml(f.name)}" rows="${f.rows || 4}" ${required} style="${baseInput}resize:vertical;">${escapeHtml(v)}</textarea>`;
  } else if (f.type === "select") {
    const opts = (f.options || []).map(o => {
      const [val, lbl] = Array.isArray(o) ? o : [o, o];
      return `<option value="${escapeHtml(val)}" ${String(v) === String(val) ? "selected" : ""}>${escapeHtml(lbl)}</option>`;
    }).join("");
    input = `<select name="${escapeHtml(f.name)}" ${required} style="${baseInput}">${f.required ? "" : '<option value=""></option>'}${opts}</select>`;
  } else if (f.type === "json") {
    const vs = typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : v;
    input = `<textarea name="${escapeHtml(f.name)}" rows="${f.rows || 4}" style="${baseInput}resize:vertical;font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(vs)}</textarea>`;
  } else {
    const inputType = f.type || "text";
    const extra = f.min !== undefined ? `min="${f.min}"` : "";
    const extra2 = f.max !== undefined ? `max="${f.max}"` : "";
    input = `<input type="${inputType}" name="${escapeHtml(f.name)}" value="${escapeHtml(v)}" ${required} ${extra} ${extra2} style="${baseInput}" />`;
  }
  return `<div style="margin-bottom:14px;">${label}${input}</div>`;
}

// Show a transient toast at the bottom-right.
export function toast(message, kind = "ok") {
  let host = $("#admin-toast");
  if (!host) {
    host = document.createElement("div");
    host.id = "admin-toast";
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:100;display:flex;flex-direction:column;gap:8px;font-family:'Manrope',sans-serif;font-size:13.5px;";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  const colors = kind === "err"
    ? "background:#9B4220;color:#F4F2EC;border:1px solid #C25A2D;"
    : "background:#0F1A2E;color:#F4F2EC;border:1px solid rgba(244,242,236,.18);";
  t.style.cssText = `padding:10px 14px;border-radius:8px;box-shadow:0 12px 30px rgba(15,26,46,.25);${colors}`;
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 3000);
  setTimeout(() => { t.remove(); }, 3500);
}

// Wraps an async data-fetcher with try/catch that shows an inline error row in
// the given table. Used by every list page.
export async function tryRender(fn, tbodySelector) {
  try { await fn(); }
  catch (e) {
    console.error(e);
    const tbody = $(tbodySelector);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="99" style="padding:16px;color:#9B4220;font-family:'JetBrains Mono',monospace;font-size:12px;">Gabim: ${escapeHtml(e.message || String(e))}</td></tr>`;
    }
    toast("Gabim: " + (e.message || e), "err");
  }
}

// Standard "boot" sequence every admin page repeats.
export async function boot(allowedRoles = STAFF_ROLES) {
  // _shell.js (loaded as a classic script) already ran renderShell synchronously
  // by the time this module executes, because <script type="module"> defers.
  const profile = await requireStaff(allowedRoles);
  if (!profile) throw new Error("redirected");
  filterNavByRole(profile.role);
  patchSidebarIdentity(profile);
  return profile;
}
