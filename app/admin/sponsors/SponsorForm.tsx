"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";

type Initial = {
  name: string;
  tier: string;
  role_sq: string | null;
  role_en: string | null;
  body_sq: string | null;
  body_en: string | null;
  website_url: string | null;
  contract_start: string | null;
  contract_end: string | null;
  display_order: number;
  active: boolean;
  logo_media_id: string | null;
};

export function SponsorForm({ action, initial, media, submitLabel }: { action: (f: FormData) => Promise<void>; initial?: Initial; media: MediaOption[]; submitLabel: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Emri *</label>
          <input name="name" required defaultValue={initial?.name ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Tieri *</label>
          <select name="tier" defaultValue={initial?.tier ?? "partner"}>
            <option value="title">Title</option>
            <option value="technical">Technical</option>
            <option value="partner">Partner</option>
            <option value="supporter">Supporter</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Roli (SQ)</label>
          <input name="role_sq" defaultValue={initial?.role_sq ?? ""} placeholder="Sponsor i përgjithshëm" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Role (EN)</label>
          <input name="role_en" defaultValue={initial?.role_en ?? ""} placeholder="Title sponsor" />
        </div>
      </div>

      <div className="field">
        <label>Përshkrimi (SQ)</label>
        <textarea name="body_sq" rows={4} defaultValue={initial?.body_sq ?? ""} />
      </div>

      <div className="field">
        <label>Description (EN)</label>
        <textarea name="body_en" rows={4} defaultValue={initial?.body_en ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 180px 120px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Website</label>
          <input name="website_url" type="url" defaultValue={initial?.website_url ?? ""} placeholder="https://" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kontrata fillon</label>
          <input name="contract_start" type="date" defaultValue={initial?.contract_start ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kontrata mbaron</label>
          <input name="contract_end" type="date" defaultValue={initial?.contract_end ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Renditja</label>
          <input name="display_order" type="number" defaultValue={initial?.display_order ?? 100} />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Statusi</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
          <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
          Aktiv
        </label>
      </div>

      <MediaPicker name="logo_media_id" options={media} initial={initial?.logo_media_id ?? null} label="Logo" />

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur..." : submitLabel}</button>
        <Link href="/admin/sponsors" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
