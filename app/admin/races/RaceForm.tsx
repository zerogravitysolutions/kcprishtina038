"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";

type Initial = {
  name: string;
  race_date: string;
  location: string | null;
  race_type: string | null;
  organizer: string | null;
  description: string | null;
  result_summary: string | null;
  external_url: string | null;
  cover_media_id: string | null;
  gallery_media_ids?: string[] | null;
  display_order: number;
};

const RACE_TYPES: { v: string; label: string }[] = [
  { v: "road", label: "Rrugore" },
  { v: "mtb", label: "MTB / XCO" },
  { v: "tt", label: "Kronometër" },
  { v: "stage", label: "Etapa / Tour" },
  { v: "gravel", label: "Gravel" },
  { v: "cyclocross", label: "Cyclocross" },
];

export function RaceForm({
  action, initial, media, linkNewsId, submitLabel,
}: {
  action: (f: FormData) => Promise<void>;
  initial?: Initial;
  media: MediaOption[];
  /** When set, the race-event create action also links this news row to the new race. */
  linkNewsId?: string;
  submitLabel: string;
}) {
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
      {linkNewsId && <input type="hidden" name="link_news_id" value={linkNewsId} />}

      <div className="field">
        <label>Emri i garës *</label>
        <input name="name" required defaultValue={initial?.name ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 200px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Data *</label>
          <input name="race_date" type="date" required defaultValue={initial?.race_date ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Vendi</label>
          <input name="location" defaultValue={initial?.location ?? ""} placeholder="P.sh. Germi, Prishtinë" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Lloji</label>
          <select name="race_type" defaultValue={initial?.race_type ?? ""}>
            <option value="">— Asnjë —</option>
            {RACE_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Organizatori</label>
        <input name="organizer" defaultValue={initial?.organizer ?? ""} placeholder="P.sh. FÇK, UCI, Veloprishtina" />
      </div>

      <div className="field">
        <label>Përshkrimi</label>
        <textarea name="description" rows={5} defaultValue={initial?.description ?? ""} />
      </div>

      <div className="field">
        <label>Përmbledhja e rezultateve</label>
        <textarea name="result_summary" rows={3} defaultValue={initial?.result_summary ?? ""} placeholder="P.sh. Albion Ymeri — vendi 3 Elite (4:14)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>URL e jashtme</label>
          <input name="external_url" type="url" defaultValue={initial?.external_url ?? ""} placeholder="https://..." />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Renditja</label>
          <input name="display_order" type="number" defaultValue={initial?.display_order ?? 100} />
        </div>
      </div>

      <MediaPicker name="cover_media_id" options={media} initial={initial?.cover_media_id ?? null} label="Imazh kopertine" />

      <MediaPicker
        name="gallery_media_ids"
        options={media}
        initial={initial?.gallery_media_ids ?? []}
        label="Galeria"
        multiple
      />


      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur…" : submitLabel}</button>
        <Link href="/admin/races" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
