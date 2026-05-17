"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDocument } from "./actions";

const CATEGORIES = [
  { value: "regulations",  label: "Rregulloret" },
  { value: "decisions",    label: "Vendimet" },
  { value: "minutes",      label: "Procesverbalet" },
  { value: "declarations", label: "Deklaratat" },
  { value: "certificates", label: "Vërtetimet" },
  { value: "other",        label: "Të tjera" },
] as const;

const VISIBILITIES = [
  { value: "public",  label: "Publike (çdokush)" },
  { value: "members", label: "Vetëm anëtarët" },
  { value: "admin",   label: "Vetëm administratorët" },
] as const;

// PDF-only client-side gate (the server action and DB CHECK enforce too).
const PDF_TYPES = ["application/pdf"];
const PDF_EXTS = [".pdf"];

export function UploadForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [fileLabel, setFileLabel] = useState<string>("Asnjë skedar i zgjedhur");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onFile = (f: File | null) => {
    if (!f) { setFileLabel("Asnjë skedar i zgjedhur"); return; }
    const okType = PDF_TYPES.includes(f.type) || PDF_EXTS.some((e) => f.name.toLowerCase().endsWith(e));
    if (!okType) {
      setMsg({ ok: false, text: "Vetëm skedarë PDF lejohen." });
      if (fileRef.current) fileRef.current.value = "";
      setFileLabel("Asnjë skedar i zgjedhur");
      return;
    }
    setMsg(null);
    setFileLabel(`${f.name} · ${(f.size / 1024).toFixed(0)} KB`);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const res = await uploadDocument(fd);
      if (res.ok) {
        setMsg({ ok: true, text: `U ngarkua: /${res.slug}` });
        (e.target as HTMLFormElement).reset();
        setFileLabel("Asnjë skedar i zgjedhur");
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="docs-upload-form">
      <div className="docs-upload-row">
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Titulli</span>
          <input name="title" type="text" required placeholder="p.sh. Statuti i klubit 2026" />
        </label>
        <label className="field">
          <span>Kategoria</span>
          <select name="category" defaultValue="other" required>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Dukshmëria</span>
          <select name="visibility" defaultValue="public" required>
            {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Data efektive</span>
          <input name="effective_date" type="date" />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Përshkrimi (opsionale)</span>
          <textarea name="description" rows={2} placeholder="Përshkrim i shkurtër..." />
        </label>
      </div>

      <div className="docs-file-row">
        <label className="docs-file-pick">
          <input
            ref={fileRef}
            name="file"
            type="file"
            accept=".pdf,application/pdf"
            required
            onChange={(e) => onFile(e.currentTarget.files?.[0] ?? null)}
          />
          <span className="docs-file-btn">Zgjidh PDF</span>
          <span className="docs-file-label mono">{fileLabel}</span>
        </label>
        <button
          type="submit"
          className="btn btn-ember"
          disabled={pending}
        >
          {pending ? "Duke ngarkuar…" : "Ngarko"}
        </button>
      </div>

      {msg && (
        <div className={`docs-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>
      )}
    </form>
  );
}
