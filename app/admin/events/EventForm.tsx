"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";

type Initial = {
  title_sq: string;
  title_en: string | null;
  type: string;
  status: string;
  section_id: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  description_sq: string | null;
  description_en: string | null;
  cover_media_id: string | null;
};

type Section = { id: string; name_sq: string };

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function EventForm({ action, initial, sections, media, submitLabel }: { action: (f: FormData) => Promise<void>; initial?: Initial; sections: Section[]; media: MediaOption[]; submitLabel: string }) {
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
      <div className="field">
        <label>Titulli (SQ) *</label>
        <input name="title_sq" required defaultValue={initial?.title_sq ?? ""} />
      </div>
      <div className="field">
        <label>Title (EN)</label>
        <input name="title_en" defaultValue={initial?.title_en ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Tipi *</label>
          <select name="type" defaultValue={initial?.type ?? "race"}>
            <option value="race">Race</option>
            <option value="ride">Ride</option>
            <option value="camp">Camp</option>
            <option value="training">Training</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Statusi</label>
          <select name="status" defaultValue={initial?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Seksioni</label>
          <select name="section_id" defaultValue={initial?.section_id ?? ""}>
            <option value="">— Asnjë —</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name_sq}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Fillon *</label>
          <input name="start_at" type="datetime-local" required defaultValue={toLocal(initial?.start_at ?? null)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Mbaron</label>
          <input name="end_at" type="datetime-local" defaultValue={toLocal(initial?.end_at ?? null)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Vendi</label>
          <input name="location" defaultValue={initial?.location ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Distanca (km)</label>
          <input name="distance_km" type="number" step="0.1" defaultValue={initial?.distance_km ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Lartësia (m)</label>
          <input name="elevation_m" type="number" defaultValue={initial?.elevation_m ?? ""} />
        </div>
      </div>

      <div className="field">
        <label>Përshkrimi (SQ)</label>
        <textarea name="description_sq" rows={5} defaultValue={initial?.description_sq ?? ""} />
      </div>
      <div className="field">
        <label>Description (EN)</label>
        <textarea name="description_en" rows={4} defaultValue={initial?.description_en ?? ""} />
      </div>

      <MediaPicker name="cover_media_id" options={media} initial={initial?.cover_media_id ?? null} label="Imazh kopertine" />

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur..." : submitLabel}</button>
        <Link href="/admin/events" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
