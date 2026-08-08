"use client";

import { useMemo, useState, useTransition } from "react";
import { registerForEvent } from "./actions";
import {
  CATEGORIES, categoryAge, eligibleCategories, validateCategoryChoice,
  type Gender,
} from "@/lib/race-category";

export function RegisterForm({ slug, eventStartIso }: { slug: string; eventStartIso: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [category, setCategory] = useState("");

  const age = dob ? categoryAge(dob, eventStartIso) : null;
  const allowed = useMemo(
    () => eligibleCategories(dob || null, eventStartIso, gender || null),
    [dob, gender, eventStartIso],
  );
  const allowedSet = useMemo(() => new Set(allowed.map((c) => c.v)), [allowed]);

  // Live hint for the currently-picked category.
  const liveCheck =
    category
      ? validateCategoryChoice({
          category,
          dobIso: dob || null,
          raceIso: eventStartIso,
          gender: gender || null,
        })
      : { ok: true as const };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await registerForEvent(slug, fd);
          if (r.ok) {
            setMsg({ ok: true, text: "U regjistrove me sukses! Të dhënat i dërguam te klubi — do të të kontaktojmë me detajet." });
            (e.target as HTMLFormElement).reset();
            setDob(""); setGender(""); setCategory("");
          } else {
            setMsg({ ok: false, text: r.error });
          }
        });
      }}
      style={{ display: "grid", gap: 14, maxWidth: 720 }}
    >
      <input
        type="text"
        name="_gotcha"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: -9999, width: 1, height: 1 }}
      />

      {msg && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: msg.ok ? "color-mix(in oklab, var(--ok) 12%, transparent)" : "color-mix(in oklab, var(--err) 12%, transparent)",
            color: msg.ok ? "var(--ok)" : "var(--err)",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-name">Emri i plotë *</label>
          <input id="r-name" name="full_name" type="text" required placeholder="P.sh. Albion Ymeri" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-dob">Data e lindjes *</label>
          <input
            id="r-dob"
            name="dob"
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            min="1930-01-01"
          />
          {age != null && (
            <small className="mono" style={{ display: "block", marginTop: 4, color: "var(--ink-3)", fontSize: 11, letterSpacing: ".08em" }}>
              Mosha e kategorisë: {age} vjeç (në vitin e garës)
            </small>
          )}
        </div>
      </div>

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-email">Email *</label>
          <input id="r-email" name="email" type="email" required placeholder="ti@email.com" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-phone">Telefoni</label>
          <input id="r-phone" name="phone" type="tel" placeholder="+383 4_ ___ ___" />
        </div>
      </div>

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-gender">Gjinia *</label>
          <select
            id="r-gender"
            name="gender"
            required
            value={gender}
            onChange={(e) => {
              const g = e.target.value as Gender | "";
              setGender(g);
              // Drop the chosen category if the new gender disqualifies it.
              if (category && g) {
                const def = CATEGORIES.find((c) => c.v === category);
                if (def?.gender && def.gender !== g) setCategory("");
              }
            }}
          >
            <option value="">— Zgjidh —</option>
            <option value="m">Mashkull</option>
            <option value="f">Femër</option>
            <option value="other">Tjetër</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, gridColumn: "span 2" }}>
          <label htmlFor="r-category">Kategoria</label>
          <select
            id="r-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!dob || !gender}
          >
            <option value="">
              {!dob || !gender ? "— Plotëso datën e lindjes dhe gjininë —" : "— Zgjidh —"}
            </option>
            {CATEGORIES.map((c) => {
              const ok = allowedSet.has(c.v);
              const range =
                c.min != null && c.max != null
                  ? ` (${c.min}–${c.max})`
                  : c.min != null
                    ? ` (${c.min}+)`
                    : "";
              return (
                <option key={c.v} value={c.v} disabled={!ok}>
                  {c.label}
                  {range}
                  {!ok ? " · nuk lejohet" : ""}
                </option>
              );
            })}
          </select>
          {!liveCheck.ok && (
            <small style={{ display: "block", marginTop: 6, color: "var(--err)", fontSize: 12 }}>
              {liveCheck.error}
            </small>
          )}
        </div>
      </div>

      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="r-club">Klubi</label>
          <input id="r-club" name="club" type="text" placeholder="KÇ Prishtina 038" />
        </div>
        <div className="field" style={{ marginBottom: 0 }} />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="r-notes">Shënime (opsionale)</label>
        <textarea id="r-notes" name="notes" rows={3} placeholder="Diçka që duhet të dimë" />
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-ember"
          disabled={pending || !liveCheck.ok}
        >
          <span>{pending ? "Duke u regjistruar…" : "Regjistrohu për garën"}</span>
          {!pending && (
            <svg className="arrow" viewBox="0 0 14 14" fill="none">
              <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
