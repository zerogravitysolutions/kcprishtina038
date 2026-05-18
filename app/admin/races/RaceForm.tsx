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
  const [galleryShow, setGalleryShow] = useState(80);

  function toggleGallery(id: string) {
    setGalleryIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  const mediaById = new Map(media.map((m) => [m.id, m]));
  // Newest-first; callers pass it pre-sorted, but enforce.
  const sortedMedia = [...media].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  const filteredMedia = (() => {
    const f = galleryFilter.trim().toLowerCase();
    if (!f) return sortedMedia;
    return sortedMedia.filter((m) => {
      const hay = `${m.filename} ${m.alt ?? ""} ${m.storage_path}`.toLowerCase();
      return f.split(/\s+/).every((t) => hay.includes(t));
    });
  })();
  const visibleMedia = filteredMedia.slice(0, galleryShow);

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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 10 }}>
            {galleryIds.map((id) => {
              const m = mediaById.get(id);
              if (!m) {
                return (
                  <button
                    key={id} type="button" onClick={() => toggleGallery(id)}
                    title="Hiq nga galeria"
                    style={{ width: 96, height: 96, border: "1px dashed var(--line-strong)", borderRadius: 6, background: "var(--white)", color: "var(--ink-3)", fontSize: 10, fontFamily: "var(--font-mono)", cursor: "pointer" }}
                  >FOTO?</button>
                );
              }
              return (
                <button
                  key={id} type="button" onClick={() => toggleGallery(id)} title={`Hiq · ${m.alt || m.filename}`}
                  style={{ width: 96, height: 96, padding: 0, border: "2px solid var(--ember)", borderRadius: 6, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer", position: "relative" }}
                >
                  <img src={`${supaUrl}/storage/v1/object/public/media/${m.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                  <span style={{ position: "absolute", top: 4, right: 4, background: "var(--ember)", color: "var(--paper)", width: 20, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</span>
                </button>
              );
            })}
          </div>
        )}
        <input
          type="search"
          placeholder="Kërko (emri, alt, ose date si '2025')..."
          value={galleryFilter}
          onChange={(e) => { setGalleryFilter(e.target.value); setGalleryShow(80); }}
          style={{ width: "100%", marginBottom: 6 }}
        />
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em", marginBottom: 6 }}>
          {galleryFilter
            ? `${visibleMedia.length}/${filteredMedia.length} rezultate · më të rejat më parë`
            : `Më të rejat ${visibleMedia.length}/${media.length} · radhitur sipas datës`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, maxHeight: 360, overflowY: "auto", padding: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8 }}>
          {visibleMedia.map((o) => {
            const selected = galleryIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggleGallery(o.id)}
                title={o.alt || o.filename}
                style={{ aspectRatio: "1", padding: 0, border: selected ? "2px solid var(--ember)" : "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "var(--paper-2)", cursor: "pointer", position: "relative" }}
              >
                <img src={`${supaUrl}/storage/v1/object/public/media/${o.storage_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selected ? 0.55 : 1 }} loading="lazy" />
                {selected && (
                  <span style={{ position: "absolute", top: 4, right: 4, background: "var(--ember)", color: "var(--paper)", width: 20, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
        {filteredMedia.length > visibleMedia.length && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => setGalleryShow((c) => c + 80)}>
            Ngarko {Math.min(80, filteredMedia.length - visibleMedia.length)} të tjera ({filteredMedia.length - visibleMedia.length} mbeten)
          </button>
        )}
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
          Kliko foton për ta shtuar ose hequr nga galeria. Galeria shfaqet në faqen publike <code>/races/&lt;slug&gt;</code>.
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
