"use client";
import { useState, useTransition } from "react";
import { saveProfile, type ProfileUpdate } from "./actions";

type Initial = {
  full_name: string; email: string;
  phone: string | null; dob: string | null; bio: string | null;
  metadata: Record<string, string> | null;
};

const META_FIELDS = [
  ["gender", "Gender"],
  ["address", "Address"],
  ["city", "City"],
  ["postal_code", "Postal"],
  ["nationality", "Nationality"],
  ["id_number", "ID / Passport number"],
  ["shoe_eu", "Shoe (EU)"],
  ["height_cm", "Height (cm)"],
  ["weight_kg", "Weight (kg)"],
  ["strava", "Strava handle"],
  ["instagram", "Instagram"],
] as const;

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
      const v = String(fd.get("meta_" + k) ?? "").trim();
      if (v) meta[k] = v;
    }
    const payload: ProfileUpdate = {
      full_name: [fn, ln].filter(Boolean).join(" ") || initial.full_name,
      phone: String(fd.get("phone") ?? "").trim() || null,
      dob: String(fd.get("dob") ?? "") || null,
      bio: String(fd.get("bio") ?? "").trim() || null,
      metadata: meta,
    };
    setStatus("Po ruan…"); setStatusColor("var(--ink-3)");
    start(async () => {
      const result = await saveProfile(payload);
      if (!result.ok) { setStatus("Gabim: " + result.error); setStatusColor("var(--ember-deep)"); return; }
      setStatus("Ruajtur · " + new Date().toLocaleTimeString("sq", { hour: "2-digit", minute: "2-digit" }));
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
          <label>First name</label>
          <input type="text" name="first_name" defaultValue={firstName} />
        </div>
        <div className="field">
          <label>Last name</label>
          <input type="text" name="last_name" defaultValue={lastName} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Date of birth</label>
          <input type="date" name="dob" defaultValue={initial.dob ?? ""} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input type="tel" name="phone" defaultValue={initial.phone ?? ""} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Email</label>
          <input type="email" name="email" defaultValue={initial.email} disabled style={{ background: "color-mix(in oklab, var(--ink) 4%, var(--white))", color: "var(--ink-3)" }} />
        </div>
        <div className="field">
          <label>Nationality</label>
          <input type="text" name="meta_nationality" defaultValue={meta.nationality ?? ""} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field">
          <label>Address</label>
          <input type="text" name="meta_address" defaultValue={meta.address ?? ""} />
        </div>
        <div className="field">
          <label>City</label>
          <input type="text" name="meta_city" defaultValue={meta.city ?? ""} />
        </div>
        <div className="field">
          <label>Postal</label>
          <input type="text" name="meta_postal_code" defaultValue={meta.postal_code ?? ""} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label>Short bio</label>
        <textarea name="bio" rows={3} defaultValue={initial.bio ?? ""} />
      </div>

      <h3 style={{ marginTop: 28, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Equipment & socials</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
        <div className="field"><label>Shoe (EU)</label><input type="number" name="meta_shoe_eu" defaultValue={meta.shoe_eu ?? ""} /></div>
        <div className="field"><label>Height (cm)</label><input type="number" name="meta_height_cm" defaultValue={meta.height_cm ?? ""} /></div>
        <div className="field"><label>Weight (kg)</label><input type="number" name="meta_weight_kg" defaultValue={meta.weight_kg ?? ""} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div className="field"><label>Strava handle</label><input type="text" name="meta_strava" defaultValue={meta.strava ?? ""} /></div>
        <div className="field"><label>Instagram</label><input type="text" name="meta_instagram" defaultValue={meta.instagram ?? ""} /></div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 20, borderTop: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: statusColor, letterSpacing: ".04em" }}>{status}</span>
        <button className="btn btn-ember" type="submit" disabled={pending}>
          {pending ? "Po ruan…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
