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
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [galleryIds, setGalleryIds] = useState<string[]>(initial?.gallery_media_ids ?? []);
  const [galleryFilter, setGalleryFilter] = useState("");

  function toggleGallery(id: string) {
    setGalleryIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  const mediaById = new Map(media.map((m) => [m.id, m]));
  const filteredMedia = (() => {
    const f = galleryFilter.trim().toLowerCase();
    if (!f) return media.slice(0, 60);
    return media.filter((m) => m.filename.toLowerCase().includes(f) || m.storage_path.toLowerCase().includes(f)).slice(0, 60);
  })();

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
          <label>Tipi</label>
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

      {/* Gallery */}
      <div className="field">
        <label>Galeria ({galleryIds.length})</label>
        <input type="hidden" name="gallery_media_ids" value={galleryIds.join(",")} />
        {galleryIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }}>
            {galleryIds.map((id) => {
              const m = mediaById.get(id);
              if (!m) {
                return (
                  <button
                    key={id} type="button" onClick={() => toggleGallery(id)}
                    title="Hiq nga galeria"
                    style={{ width: 56, height: 56, border: "1px dashed var(--line-strong)", borderRadius: 4, background: "var(--white)", color: "var(--ink-3)", fontSize: 9, fontFamily: "var(--font-mono)", cursor: "pointer" }}
                  >FOTO?</button>
                );
              }
              return (
                <button
                  key={id} type="button" onClick={() => toggleGallery(id)} title="Hiq nga galeria"
                  style={{ width: 56, height: 56, padding: 0, border: "2px solid var(--ember)", borderRadius: 4, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer", position: "relative" }}
                >
                  <img src={`${supaUrl}/storage/v1/object/public/media/${m.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                </button>
              );
            })}
          </div>
        )}
        <input
          type="search"
          placeholder="Kërko për të shtuar foto..."
          value={galleryFilter}
          onChange={(e) => setGalleryFilter(e.target.value)}
          style={{ width: "100%", marginBottom: 6 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 6, maxHeight: 200, overflowY: "auto", padding: 6, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 6 }}>
          {filteredMedia.map((o) => {
            const selected = galleryIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggleGallery(o.id)}
                title={o.filename}
                style={{ aspectRatio: "1", padding: 0, border: selected ? "2px solid var(--ember)" : "1px solid var(--line)", borderRadius: 4, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer" }}
              >
                <img src={`${supaUrl}/storage/v1/object/public/media/${o.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selected ? 0.6 : 1 }} loading="lazy" />
              </button>
            );
          })}
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
          Kliko foton që të shtosh ose heqësh nga galeria. Galeria shfaqet në faqen publike <code>/races/&lt;slug&gt;</code>.
        </p>
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur..." : submitLabel}</button>
        <Link href="/admin/races" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
