"use client";
import { useState, useTransition } from "react";
import { normalizeDecimal } from "@/lib/numeric";
import { saveProfile, type ProfileUpdate } from "./actions";

type Initial = {
  full_name: string; email: string;
  phone: string | null; dob: string | null; bio: string | null;
  metadata: Record<string, string> | null;
};

const META_FIELDS = [
  ["gender", "Gjinia"],
  ["address", "Adresa"],
  ["city", "Qyteti"],
  ["postal_code", "Kodi postar"],
  ["nationality", "Shtetësia"],
  ["id_number", "Numri i letërnjoftimit / pasaportës"],
  ["shoe_eu", "Numri i këpucëve (EU)"],
  ["height_cm", "Gjatësia (cm)"],
  ["weight_kg", "Pesha (kg)"],
  ["strava", "Profili në Strava"],
  ["instagram", "Instagram"],
] as const;

/** Metadata keys that hold a number typed on a numeric keypad. */
const NUMERIC_META = new Set<string>(["shoe_eu", "height_cm", "weight_kg"]);

export function ProfileForm({ initial }: { initial: Initial }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string>("—");
  const [statusColor, setStatusColor] = useState<string>("var(--ink-3)");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fn = String(fd.get("first_name") ?? "").trim();
    const ln = String(fd.get("last_name") ?? "").trim();
    const meta: Record<string, string> = {};
    for (const [k] of META_FIELDS) {
      let v = String(fd.get("meta_" + k) ?? "").trim();
      // The metadata blob holds strings, so "68,5" would be STORED as "68,5"
      // and read back by anything numeric (w/kg on the coach side) as 68.
      if (v && NUMERIC_META.has(k)) v = normalizeDecimal(v);
      if (v) meta[k] = v;
    }
    const payload: ProfileUpdate = {
      full_name: [fn, ln].filter(Boolean).join(" ") || initial.full_name,
      phone: String(fd.get("phone") ?? "").trim() || null,
      dob: String(fd.get("dob") ?? "") || null,
      bio: String(fd.get("bio") ?? "").trim() || null,
      metadata: meta,
    };
    setStatus("Duke ruajtur…"); setStatusColor("var(--ink-3)");
    start(async () => {
      const result = await saveProfile(payload);
      if (!result.ok) { setStatus("Gabim: " + result.error); setStatusColor("var(--ember-deep)"); return; }
      setStatus("U ruajt · " + new Date().toLocaleTimeString("sq", { hour: "2-digit", minute: "2-digit" }));
      setStatusColor("var(--ok, #2f8a4e)");
    });
  };

  const parts = (initial.full_name || "").trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const meta = initial.metadata ?? {};

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label>Emri</label>
          <input type="text" name="first_name" defaultValue={firstName} autoComplete="given-name" autoCapitalize="words" />
        </div>
        <div className="field">
          <label>Mbiemri</label>
          <input type="text" name="last_name" defaultValue={lastName} autoComplete="family-name" autoCapitalize="words" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Datëlindja</label>
          <input type="date" name="dob" defaultValue={initial.dob ?? ""} />
        </div>
        <div className="field">
          <label>Telefoni</label>
          <input type="tel" inputMode="tel" name="phone" autoComplete="tel" autoCorrect="off" defaultValue={initial.phone ?? ""} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Email</label>
          <input type="email" inputMode="email" name="email" defaultValue={initial.email} disabled style={{ background: "color-mix(in oklab, var(--ink) 4%, var(--white))", color: "var(--ink-3)" }} />
        </div>
        <div className="field">
          <label>Shtetësia</label>
          <input type="text" name="meta_nationality" defaultValue={meta.nationality ?? ""} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Adresa</label>
          <input type="text" name="meta_address" defaultValue={meta.address ?? ""} autoComplete="street-address" autoCapitalize="words" />
        </div>
        <div className="field">
          <label>Qyteti</label>
          <input type="text" name="meta_city" defaultValue={meta.city ?? ""} autoComplete="address-level2" autoCapitalize="words" />
        </div>
        <div className="field">
          <label>Kodi postar</label>
          <input type="text" inputMode="numeric" name="meta_postal_code" defaultValue={meta.postal_code ?? ""} autoComplete="postal-code" autoCorrect="off" />
        </div>
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label>Biografi e shkurtër</label>
        <textarea name="bio" rows={3} defaultValue={initial.bio ?? ""} />
      </div>

      <h3 style={{ marginTop: 28, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Pajisjet dhe rrjetet sociale</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
        {/* type="text" + inputMode, not type="number": the phone keypad that
            fills these emits "," for the decimal point, and type="number"
            answers a comma with an EMPTY string — the value would vanish on
            save. NUMERIC_META normalises "42,5" → "42.5" in onSubmit below. */}
        <div className="field">
          <label htmlFor="p-shoe">Numri i këpucëve (EU)</label>
          <input id="p-shoe" type="text" inputMode="decimal" pattern="[0-9]*([.,][0-9]*)?" title="Shkruaj vetëm numra, p.sh. 43." name="meta_shoe_eu" defaultValue={meta.shoe_eu ?? ""} autoComplete="off" placeholder="p.sh. 43" />
        </div>
        <div className="field">
          <label htmlFor="p-height">Gjatësia (cm)</label>
          <input id="p-height" type="text" inputMode="numeric" pattern="[0-9]*" title="Shkruaj vetëm numra të plotë, p.sh. 178." name="meta_height_cm" defaultValue={meta.height_cm ?? ""} autoComplete="off" placeholder="p.sh. 178" />
        </div>
        <div className="field">
          <label htmlFor="p-weight">Pesha (kg)</label>
          <input id="p-weight" type="text" inputMode="decimal" pattern="[0-9]*([.,][0-9]*)?" title="Shkruaj një numër, p.sh. 68 ose 68,5." name="meta_weight_kg" defaultValue={meta.weight_kg ?? ""} autoComplete="off" placeholder="p.sh. 68,5" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label htmlFor="p-strava">Profili në Strava</label>
          <input id="p-strava" type="text" inputMode="url" name="meta_strava" defaultValue={meta.strava ?? ""} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://strava.com/athletes/…" />
        </div>
        <div className="field">
          <label htmlFor="p-instagram">Instagram</label>
          <input id="p-instagram" type="text" name="meta_instagram" defaultValue={meta.instagram ?? ""} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@emri" />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 20, borderTop: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: statusColor, letterSpacing: ".04em" }}>{status}</span>
        <button className="btn btn-ember" type="submit" disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ruaj ndryshimet"}
        </button>
      </div>
    </form>
  );
}
