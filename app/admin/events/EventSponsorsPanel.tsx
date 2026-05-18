"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { MediaPicker, type MediaOption } from "@/components/admin/MediaPicker";
import { createEventSponsor, updateEventSponsor, deleteEventSponsor } from "./actions";

export type EventSponsor = {
  id: string;
  name: string;
  tier: string;
  role_sq: string | null;
  body_sq: string | null;
  website_url: string | null;
  display_order: number;
  active: boolean;
  logo_media_id: string | null;
  logo: { storage_path: string } | null;
};

const TIERS: { v: string; label: string }[] = [
  { v: "title",     label: "Title" },
  { v: "technical", label: "Technical" },
  { v: "partner",   label: "Partner" },
  { v: "supporter", label: "Supporter" },
];

function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return base ? `${base}/storage/v1/object/public/media/${path}` : null;
}

function SponsorFormModal({
  open, onClose, eventId, mediaOptions, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  mediaOptions: MediaOption[];
  /** When set, edit mode. When null, create. */
  initial: EventSponsor | null;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit · ${initial.name}` : "Sponsor i ri për këtë garë"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = initial
              ? await updateEventSponsor(eventId, initial.id, fd)
              : await createEventSponsor(eventId, fd);
            if (r.ok) { onSaved(); onClose(); }
            else { setErr(r.error); }
          });
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Emri *</label>
            <input name="name" required defaultValue={initial?.name ?? ""} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tieri *</label>
            <select name="tier" defaultValue={initial?.tier ?? "partner"}>
              {TIERS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Roli (SQ)</label>
          <input name="role_sq" defaultValue={initial?.role_sq ?? ""} placeholder="Sponsor i gares" />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Përshkrimi i shkurtër (SQ)</label>
          <textarea name="body_sq" rows={3} defaultValue={initial?.body_sq ?? ""} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Website</label>
            <input name="website_url" type="url" defaultValue={initial?.website_url ?? ""} placeholder="https://" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Renditja</label>
            <input name="display_order" type="number" defaultValue={initial?.display_order ?? 100} />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
            Aktiv
          </label>
        </div>

        <MediaPicker
          name="logo_media_id"
          options={mediaOptions}
          initial={initial?.logo_media_id ?? null}
          label="Logo"
        />

        {err && (
          <div
            className="mono"
            style={{
              padding: "10px 12px", fontSize: 12, borderRadius: 6,
              background: "color-mix(in oklab, var(--err) 10%, transparent)",
              color: "var(--err)",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            Anulo
          </button>
          <button type="submit" className="btn btn-ember btn-sm" disabled={pending}>
            {pending ? "Duke ruajtur…" : initial ? "Ruaj" : "Krijo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EventSponsorsPanel({
  eventId,
  sponsors,
  mediaOptions,
  onMutated,
}: {
  eventId: string;
  sponsors: EventSponsor[];
  mediaOptions: MediaOption[];
  onMutated?: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EventSponsor | null>(null);
  const [deleting, setDeleting] = useState<EventSponsor | null>(null);
  // We rely on revalidatePath in the server action + parent server-component
  // refresh. The parent doesn't have a way to call router.refresh here; the
  // onMutated callback is optional for that.
  const refresh = onMutated ?? (() => { /* server revalidation handles it */ });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={() => setCreateOpen(true)}>
          + Sponsor i ri
        </button>
      </div>

      {sponsors.length === 0 ? (
        <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>
          Asnjë sponsor për këtë garë. Klikoni “+ Sponsor i ri” për të shtuar.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Sponsori</th>
                <th>Tier</th>
                <th>Renditja</th>
                <th>Statusi</th>
                <th>Veprime</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => {
                const url = logoUrl(s.logo?.storage_path ?? null);
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {url ? (
                          <div style={{ position: "relative", width: 56, height: 32, flexShrink: 0 }}>
                            <Image src={url} alt={s.name} fill sizes="56px" quality={85} style={{ objectFit: "contain", objectPosition: "left center" }} />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 56, height: 32, flexShrink: 0,
                              background: "var(--paper-2)", borderRadius: 4,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, color: "var(--ink-3)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            no logo
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          {s.role_sq && (
                            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                              {s.role_sq}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="mono" style={{ textTransform: "uppercase", fontSize: 11 }}>{s.tier}</td>
                    <td className="mono">{s.display_order}</td>
                    <td>
                      <span className={`badge-st ${s.active ? "ok" : "err"}`}>
                        {s.active ? "aktiv" : "joaktiv"}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--err)" }}
                        onClick={() => setDeleting(s)}
                      >
                        Fshi
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SponsorFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        eventId={eventId}
        mediaOptions={mediaOptions}
        initial={null}
        onSaved={refresh}
      />

      <SponsorFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        eventId={eventId}
        mediaOptions={mediaOptions}
        initial={editing}
        onSaved={refresh}
      />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Fshi sponsorin"
        tone="danger"
        confirmLabel="Fshi"
        message={
          deleting ? (
            <>Sigurt që do ta fshish <strong>{deleting.name}</strong> nga kjo garë? Sponsori fshihet nga baza përgjithmonë.</>
          ) : null
        }
        onConfirm={async () => {
          if (!deleting) return { ok: true };
          const r = await deleteEventSponsor(eventId, deleting.id);
          if (r.ok) refresh();
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        }}
      />
    </>
  );
}
