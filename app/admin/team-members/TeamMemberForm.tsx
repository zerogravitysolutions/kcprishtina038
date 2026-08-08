"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";

type Initial = {
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  positions: string[];
  section_slug: string | null;
  photo_media_id: string | null;
  external_photo_url: string | null;
  status: string;
  ended_at: string | null;
  bio: string | null;
  display_order: number;
  profile_id: string | null;
  is_master: boolean;
};

type Section = { slug: string; name_sq: string };
type Profile = { id: string; full_name: string; role: string };

const POSITIONS: { value: string; label: string }[] = [
  { value: "president", label: "Kryetar" },
  { value: "board_member", label: "Anëtar bordi" },
  { value: "secretary_general", label: "Sekretar i përgjithshëm" },
  { value: "secretary_organizational", label: "Sekretar organizativ" },
  { value: "commissaire", label: "Komisar" },
  { value: "coach", label: "Trajner" },
  { value: "rider", label: "Çiklist/e" },
  { value: "mechanic", label: "Mekanik" },
  { value: "physio", label: "Fizioterapist" },
  { value: "staff", label: "Staf" },
];

export function TeamMemberForm({
  action, initial, sections, profiles, media, submitLabel,
}: {
  action: (f: FormData) => Promise<void>;
  initial?: Initial;
  sections: Section[];
  profiles: Profile[];
  media: MediaOption[];
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [positions, setPositions] = useState<string[]>(initial?.positions ?? ["rider"]);

  function togglePos(p: string) {
    setPositions(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        // Clear & re-add positions[]
        fd.delete("positions");
        positions.forEach(p => fd.append("positions", p));
        start(async () => {
          try { await action(fd); }
          catch (x) {
            const msg = x instanceof Error ? x.message : String(x);
            if (!msg.toLowerCase().includes("next_redirect")) setErr(msg);
          }
        });
      }}
      style={{ display: "grid", gap: 16, maxWidth: 920 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Emri *</label>
          <input name="first_name" required defaultValue={initial?.first_name ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Mbiemri *</label>
          <input name="last_name" required defaultValue={initial?.last_name ?? ""} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 220px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Datëlindja</label>
          <input name="dob" type="date" defaultValue={initial?.dob ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Gjinia</label>
          <select name="gender" defaultValue={initial?.gender ?? ""}>
            <option value="">— Pa specifikuar —</option>
            <option value="m">Mashkull</option>
            <option value="f">Femër</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select name="section_slug" defaultValue={initial?.section_slug ?? ""}>
            <option value="">— Asnjë —</option>
            {sections.map(s => <option key={s.slug} value={s.slug}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Pozicionet *</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }}>
          {POSITIONS.map(p => (
            <label key={p.value} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1px solid ${positions.includes(p.value) ? "var(--ember)" : "var(--line-strong)"}`, background: positions.includes(p.value) ? "color-mix(in oklab, var(--ember) 12%, var(--white))" : "var(--white)", borderRadius: 999, cursor: "pointer", fontSize: 13, color: "var(--ink)", textTransform: "none", letterSpacing: 0 }}>
              <input type="checkbox" checked={positions.includes(p.value)} onChange={() => togglePos(p.value)} style={{ accentColor: "var(--ember)" }} />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <MediaPicker name="photo_media_id" options={media} initial={initial?.photo_media_id ?? null} label="Foto" />

      <div className="field">
        <label>URL e jashtme e fotos (opsionale)</label>
        <input name="external_photo_url" type="url" defaultValue={initial?.external_photo_url ?? ""} placeholder="https://..." />
      </div>

      <div className="field">
        <label>Bio</label>
        <textarea name="bio" rows={4} defaultValue={initial?.bio ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 180px 120px 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Statusi</label>
          <select name="status" defaultValue={initial?.status ?? "active"}>
            <option value="active">Aktiv</option>
            <option value="past">Ish-anëtar</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Data e largimit</label>
          <input name="ended_at" type="date" defaultValue={initial?.ended_at ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Renditja</label>
          <input name="display_order" type="number" defaultValue={initial?.display_order ?? 100} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Profil i lidhur</label>
          <select name="profile_id" defaultValue={initial?.profile_id ?? ""}>
            <option value="">— Pa profil —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 4 }}>
        <label>Kategoria Master</label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", textTransform: "none", letterSpacing: 0, color: "var(--ink)", fontSize: 14 }}>
          <input type="checkbox" name="is_master" defaultChecked={initial?.is_master ?? false} />
          <span>
            Shfaq këtë çiklist si <strong>Master</strong> në publik
            <small style={{ display: "block", color: "var(--ink-3)", fontSize: 12, marginTop: 2 }}>
              Vetëm nëse çiklisti regjistrohet zyrtarisht në kategorinë Master të federatës. Pa këtë, kategoria llogaritet automatikisht nga datëlindja (Elite për 23+ vjeç).
            </small>
          </span>
        </label>
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur…" : submitLabel}</button>
        <Link href="/admin/team-members" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
