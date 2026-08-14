"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { formNumError } from "@/lib/numeric";

/** Mirrors the server checks in app/admin/events/actions.ts. */
const NUM_FIELDS = [
  { name: "distance_km", label: "Distanca", kind: "decimal" as const, min: 0, max: 100000 },
  { name: "elevation_m", label: "Ngjitja", kind: "int" as const, min: 0, max: 100000 },
];

type Initial = {
  title_sq: string;
  type: string;
  status: string;
  section_id: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  description_sq: string | null;
  cover_media_id: string | null;
  strava_url: string | null;
};

type Section = { id: string; name_sq: string };

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function EventForm({ action, initial, sections, media, submitLabel, categoriesSlot }: { action: (f: FormData) => Promise<void>; initial?: Initial; sections: Section[]; media: MediaOption[]; submitLabel: string; categoriesSlot?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        // The number fields are type="text" now (so the phone shows a keypad and
        // "42,5" survives). The action re-checks these; this copy only exists so
        // the admin reads WHICH field is wrong — React masks a thrown Server
        // Action message in production.
        const numErr = formNumError(fd, NUM_FIELDS);
        if (numErr) { setErr(numErr); return; }
        start(async () => {
          try { await action(fd); }
          catch (x) {
            const msg = actionError(x, "Ruajtja e eventit dështoi. Provo sërish.");
            if (msg) setErr(msg);
          }
        });
      }}
      style={{ display: "grid", gap: 16, maxWidth: 920 }}
    >
      <div className="field">
        <label>Titulli *</label>
        <input name="title_sq" required defaultValue={initial?.title_sq ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Lloji *</label>
          <select name="type" defaultValue={initial?.type ?? "race"}>
            <option value="race">Garë</option>
            <option value="ride">Dalje</option>
            <option value="camp">Kamp</option>
            <option value="training">Stërvitje</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Statusi</label>
          <select name="status" defaultValue={initial?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Publikuar</option>
            <option value="cancelled">Anuluar</option>
            <option value="done">Përfunduar</option>
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
          <label htmlFor="ev-distance">Distanca (km)</label>
          <NumericInput id="ev-distance" name="distance_km" kind="decimal" defaultValue={initial?.distance_km ?? ""} placeholder="p.sh. 42,5" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ev-elevation">Ngjitja (m)</label>
          <NumericInput id="ev-elevation" name="elevation_m" kind="int" defaultValue={initial?.elevation_m ?? ""} placeholder="p.sh. 650" />
        </div>
      </div>

      <div className="field">
        <label>Përshkrimi</label>
        <textarea name="description_sq" rows={5} defaultValue={initial?.description_sq ?? ""} />
      </div>

      <div className="field">
        <label>Strava — URL e rrugës, segmentit ose aktivitetit</label>
        <input
          name="strava_url"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={initial?.strava_url ?? ""}
          placeholder="https://www.strava.com/routes/... · /segments/... · /activities/..."
        />
        <small style={{ display: "block", marginTop: 4, color: "var(--ink-3)", fontSize: 11 }}>
          Mbështeten <span className="mono">routes</span>,{" "}
          <span className="mono">segments</span> dhe{" "}
          <span className="mono">activities</span>. Përdorim widget-in zyrtar
          të Strava-s në faqen publike (vetëm për linqe publike).
        </small>
      </div>

      <MediaPicker name="cover_media_id" options={media} initial={initial?.cover_media_id ?? null} label="Imazh kopertine" />

      {categoriesSlot && (
        <fieldset
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "16px 18px 18px",
            margin: 0,
          }}
        >
          <legend
            className="mono"
            style={{
              padding: "0 8px",
              fontSize: 11,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "var(--ember)",
            }}
          >
            Kategoritë e garës
          </legend>
          <div className="sub" style={{ marginBottom: 14, color: "var(--ink-3)", fontSize: 12.5 }}>
            Zgjidh kategoritë në të cilat do të hapen regjistrimet. Çdo kategori
            ka kufijtë e vet të moshës (UCI) dhe një numër maksimal opsional.
          </div>
          {categoriesSlot}
        </fieldset>
      )}

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur…" : submitLabel}</button>
        <Link href="/admin/events" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
