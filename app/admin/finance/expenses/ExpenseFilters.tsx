"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
// ALL is declared in a plain module, NOT here: the page that renders this bar
// is a Server Component, and a value exported from a "use client" file reaches
// the server as a client-reference proxy rather than as the string.
import { ALL, ALL_YEARS_LABEL } from "../filters";

export type FilterOption = { value: string; label: string };

export type ExpenseFilterValue = {
  y: string; cat: string; b: string; st: string; sp: string; pb: string;
  owed: boolean; rcpt: boolean; q: string;
};

/** The five dropdowns. `st`, `owed` and `rcpt` are set by the chips. */
type Selects = Pick<ExpenseFilterValue, "y" | "cat" | "b" | "sp" | "pb">;

function selectsOf(v: ExpenseFilterValue): Selects {
  return { y: v.y, cat: v.cat, b: v.b, sp: v.sp, pb: v.pb };
}

const DEBOUNCE_MS = 350;

/**
 * The expense filters, applied the moment you change one — no "Filtro" button.
 *
 * LAYOUT. One bar, not two: the search box and a "Filtrat" disclosure are all
 * that shows on a phone, because this screen is read on a phone in a bike shop
 * and five dropdowns stacked above the ledger pushed the actual expenses off
 * the first screen. The chips (which this bar renders but does not own — they
 * are server-rendered <Link>s handed in as children) and the dropdowns live
 * inside the panel, which is always open from 760px up, where there is room.
 * The disclosure starts OPEN whenever a filter is active, so a narrowed list
 * can never look like the whole ledger.
 *
 * The URL stays the source of truth: the list is a server component and every
 * filtered view has to stay shareable and bookmarkable, so this pushes a new
 * querystring rather than holding rows in client state. Three details that
 * matter:
 *
 *   - the free-text box is DEBOUNCED, or every keystroke would be a navigation
 *     and a Supabase round-trip;
 *   - the controls mirror the URL in local state, so a select does not snap
 *     back to its old option while the new page streams in, and so a "Pastro
 *     filtrat" link or the back button resets them. The search box ignores the
 *     echo of its OWN push, which is what stops a slow navigation from eating
 *     characters typed while it was in flight;
 *   - the wrapper is still a real <form method="get">, so pressing Enter in the
 *     search box applies everything even with JavaScript off. Every chip-owned
 *     parameter is carried as a hidden input for exactly that case — including
 *     `rcpt`, or a no-JS submit (and every dropdown change, see hrefOf) would
 *     silently drop "Pa foto të faturës".
 */
export function ExpenseFilters({
  base, defaultY, years, categories, members, sponsors, value, activeCount, children,
}: {
  base: string;
  /**
   * The year a URL with no ?y= resolves to — the newest year the ledger has a
   * row in, computed on the server. It is the one year left out of the
   * querystring; omitting any other would build a link to a different window.
   */
  defaultY: string;
  years: string[];
  categories: FilterOption[];
  members: FilterOption[];
  sponsors: FilterOption[];
  value: ExpenseFilterValue;
  /** How many filters are on, for the badge on the collapsed disclosure. */
  activeCount: number;
  /** The status / owed / receipt chips + "Pastro filtrat", from the page. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Selects>(() => selectsOf(value));
  const [q, setQ] = useState(value.q);
  // Open on first paint when something is filtered: a hidden panel over a
  // narrowed list is how a filter gets forgotten and a total gets misread.
  const [open, setOpen] = useState(activeCount > 0);
  /** The last search text this component sent to the URL. */
  const sentQ = useRef(value.q);
  /**
   * The newest dropdowns and chips, for the debounce timer to read when it
   * fires. A timer armed by a keystroke would otherwise carry the selects and
   * the chips as they were AT THAT KEYSTROKE, and pushing that stale set 350ms
   * later would silently undo a filter the user picked in between.
   */
  const latest = useRef({ sel, value });
  useEffect(() => { latest.current = { sel, value }; });

  // The URL won: re-sync the dropdowns to what the server just rendered.
  const selSignature = `${value.y}|${value.cat}|${value.b}|${value.sp}|${value.pb}`;
  useEffect(() => {
    setSel(selectsOf(value));
    // selSignature IS the value, flattened; depending on the object would
    // re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSignature]);

  // Same for the search box, except that the echo of our own push is ignored —
  // otherwise "goma " typed on, arriving back trimmed as "goma", would delete
  // what was typed in the meantime. The page trims, hence the trim() here.
  useEffect(() => {
    if (value.q === sentQ.current.trim()) return;
    sentQ.current = value.q;
    setQ(value.q);
  }, [value.q]);

  /** `chips` carries st/owed/rcpt, which this bar shows but does not own. */
  function hrefOf(nextSel: Selects, nextQ: string, chips: ExpenseFilterValue): string {
    const params = new URLSearchParams();
    if (nextSel.y && nextSel.y !== defaultY) params.set("y", nextSel.y);
    if (nextSel.cat && nextSel.cat !== ALL) params.set("cat", nextSel.cat);
    if (nextSel.b && nextSel.b !== ALL) params.set("b", nextSel.b);
    if (chips.st && chips.st !== ALL) params.set("st", chips.st);
    if (nextSel.sp && nextSel.sp !== ALL) params.set("sp", nextSel.sp);
    if (nextSel.pb && nextSel.pb !== ALL) params.set("pb", nextSel.pb);
    if (chips.owed) params.set("owed", "1");
    if (chips.rcpt) params.set("rcpt", "0");
    if (nextQ.trim()) params.set("q", nextQ.trim());
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  }

  function apply(nextSel: Selects, nextQ: string, chips: ExpenseFilterValue) {
    sentQ.current = nextQ;
    start(() => { router.push(hrefOf(nextSel, nextQ, chips)); });
  }

  function setSelect(key: keyof Selects, v: string) {
    const next = { ...sel, [key]: v };
    setSel(next);
    apply(next, q, value);
  }

  // ---- debounced search ----------------------------------------------------
  useEffect(() => {
    if (q.trim() === value.q) return;   // already exactly what the URL says
    const t = setTimeout(() => {
      // Everything except the text is read fresh: a dropdown changed while this
      // timer was armed already pushed the text along with it, and re-sending
      // the selects as they were at the keystroke would roll that change back.
      if (q.trim() === sentQ.current.trim()) return;
      apply(latest.current.sel, q, latest.current.value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <form
      method="get"
      action={base}
      className="exl-filters"
      onSubmit={(e) => { e.preventDefault(); apply(sel, q, value); }}
    >
      <div className="exl-fbar">
        <div className="exl-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
          </svg>
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kërko përshkrim, faturë…"
            aria-label="Kërko shpenzim"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          className={`exl-ftoggle${open ? " open" : ""}`}
          aria-expanded={open}
          aria-controls="exl-fpanel"
          onClick={() => setOpen((v) => !v)}
        >
          Filtrat
          {activeCount > 0 ? <span className="exl-fn">{activeCount}</span> : null}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Always rendered at a fixed width: a status that appears and
            disappears would shift the bar every time a filter is applied. */}
        <span className="exl-fstat" aria-live="polite">
          {pending ? "Duke filtruar…" : "Aplikohen vetvetiu"}
        </span>
      </div>

      <div id="exl-fpanel" className={`exl-fpanel${open ? " open" : ""}`}>
        {children ? <div className="exl-chips">{children}</div> : null}

        <div className="exl-selects">
          <label className="exl-sel">
            <span>Viti</span>
            {/* Newest year first and the catch-all LAST: the default window is
                the newest year with a row in it, and a default listed under
                "të gjitha" reads as if the screen were showing everything. */}
            <select name="y" value={sel.y} onChange={(e) => setSelect("y", e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
              <option value={ALL}>{ALL_YEARS_LABEL}</option>
            </select>
          </label>

          <label className="exl-sel">
            <span>Kategoria</span>
            <select name="cat" value={sel.cat} onChange={(e) => setSelect("cat", e.target.value)}>
              <option value={ALL}>Të gjitha</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>

          <label className="exl-sel">
            <span>Për kë</span>
            <select name="b" value={sel.b} onChange={(e) => setSelect("b", e.target.value)}>
              <option value={ALL}>Të gjithë</option>
              <option value="club">Vetëm klubi</option>
              {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <label className="exl-sel">
            <span>Paguar nga</span>
            <select name="pb" value={sel.pb} onChange={(e) => setSelect("pb", e.target.value)}>
              <option value={ALL}>Të gjithë</option>
              <option value="club">Klubi</option>
              {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <label className="exl-sel">
            <span>Burimi</span>
            <select name="sp" value={sel.sp} onChange={(e) => setSelect("sp", e.target.value)}>
              <option value={ALL}>Të gjitha</option>
              <option value="none">Pa burim</option>
              {sponsors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* The chips above set the same querystring; carrying them along keeps a
          no-JS submit from dropping them. */}
      {value.st !== ALL ? <input type="hidden" name="st" value={value.st} /> : null}
      {value.owed ? <input type="hidden" name="owed" value="1" /> : null}
      {value.rcpt ? <input type="hidden" name="rcpt" value="0" /> : null}
    </form>
  );
}
