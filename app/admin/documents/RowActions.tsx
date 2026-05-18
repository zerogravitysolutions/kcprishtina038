"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { updateDocument, deleteDocument } from "./actions";
import type { DocumentCategory, DocumentVisibility } from "@/lib/supabase/documents";

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "regulations",  label: "Rregulloret" },
  { value: "decisions",    label: "Vendimet" },
  { value: "minutes",      label: "Procesverbalet" },
  { value: "declarations", label: "Deklaratat" },
  { value: "certificates", label: "Vërtetimet" },
  { value: "other",        label: "Të tjera" },
];

const VISIBILITIES: { value: DocumentVisibility; label: string }[] = [
  { value: "public",  label: "Publike (çdokush)" },
  { value: "members", label: "Vetëm anëtarët" },
  { value: "admin",   label: "Vetëm administratorët" },
];

export function RowActions({
  id, title, slug, storagePath, fileUrl, category, visibility, description, effectiveDate, displayOrder,
}: {
  id: string;
  title: string;
  slug: string;
  storagePath: string;
  fileUrl: string;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  description: string | null;
  effectiveDate: string | null;
  displayOrder: number;
}) {
  const [view, setView] = useState(false);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  // Edit form local state
  const [t, setT] = useState(title);
  const [cat, setCat] = useState<DocumentCategory>(category);
  const [vis, setVis] = useState<DocumentVisibility>(visibility);
  const [desc, setDesc] = useState(description ?? "");
  const [eff, setEff] = useState(effectiveDate ?? "");
  const [ord, setOrd] = useState<string>(String(displayOrder ?? 0));
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setSaveMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("title", t);
      fd.set("category", cat);
      fd.set("visibility", vis);
      fd.set("description", desc);
      fd.set("effective_date", eff);
      fd.set("display_order", ord);
      const r = await updateDocument(id, fd);
      if (r.ok) {
        setSaveMsg({ ok: true, text: "Ruajtur ✓" });
        setTimeout(() => { setSaveMsg(null); setEdit(false); }, 600);
      } else {
        setSaveMsg({ ok: false, text: r.error ?? "Gabim" });
      }
    });
  }

  return (
    <>
      <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView(true)}>
          Shiko
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>
          Edit
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setDel(true)}
          style={{ color: "var(--err)" }}
        >
          Fshij
        </button>
      </div>

      {/* View — embed PDF */}
      <Modal open={view} onClose={() => setView(false)} title={title} wide>
        <div style={{ height: "70vh" }}>
          <iframe
            src={fileUrl}
            title={title}
            style={{ width: "100%", height: "100%", border: 0, borderRadius: 6 }}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
            style={{
              fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
              color: "var(--ember)", textDecoration: "none",
            }}
          >
            Hap në tab të ri ↗
          </a>
        </div>
      </Modal>

      {/* Edit */}
      <Modal
        open={edit}
        onClose={() => setEdit(false)}
        title={`Edit · ${title}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)} disabled={pending}>
              Anulo
            </button>
            <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
              {pending ? "Duke ruajtur…" : "Ruaj"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Titulli</label>
            <input value={t} onChange={(e) => setT(e.target.value)} />
            <small className="mono" style={{ marginTop: 4, color: "var(--ink-3)", fontSize: 10.5 }}>
              /{slug}
            </small>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Kategoria</label>
              <select value={cat} onChange={(e) => setCat(e.target.value as DocumentCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Dukshmëria</label>
              <select value={vis} onChange={(e) => setVis(e.target.value as DocumentVisibility)}>
                {VISIBILITIES.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Përshkrimi</label>
            <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Data efektive</label>
              <input type="date" value={eff} onChange={(e) => setEff(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Renditja</label>
              <input type="number" value={ord} onChange={(e) => setOrd(e.target.value)} />
            </div>
          </div>
          {saveMsg && (
            <div
              className="mono"
              style={{
                marginTop: 4, fontSize: 12,
                color: saveMsg.ok ? "var(--ok)" : "var(--err)",
              }}
            >
              {saveMsg.text}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={del}
        onClose={() => setDel(false)}
        title="Fshij dokumentin"
        tone="danger"
        confirmLabel="Fshij"
        message={
          <>
            Sigurt që do ta fshish <strong>{title}</strong>? Skedari PDF dhe regjistrimi në bazë do të hiqen përgjithmonë.
          </>
        }
        onConfirm={async () => {
          const r = await deleteDocument(id, storagePath);
          return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gabim" };
        }}
      />
    </>
  );
}
