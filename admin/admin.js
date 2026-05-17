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
