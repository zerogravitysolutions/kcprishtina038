"use client";

import Link from "next/link";
import { useTransition, useState } from "react";

type Props = {
  action: (form: FormData) => Promise<void>;
  initial?: {
    title_sq: string;
    title_en: string | null;
    body_sq: string;
    body_en: string | null;
    status: string;
    tags: string[];
    slug?: string;
  };
  submitLabel: string;
};

export function NewsForm({ action, initial, submitLabel }: Props) {
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
      {initial?.slug && (
        <div className="field">
          <label>Slug (URL)</label>
          <input type="text" value={`/news/${initial.slug}`} disabled style={{ background: "var(--paper)", color: "var(--ink-3)" }} />
        </div>
      )}

      <div className="field">
        <label>Titulli (SQ) *</label>
        <input name="title_sq" required defaultValue={initial?.title_sq ?? ""} />
      </div>

      <div className="field">
        <label>Title (EN)</label>
        <input name="title_en" defaultValue={initial?.title_en ?? ""} />
      </div>

      <div className="field">
        <label>Trupi (SQ) *</label>
        <textarea name="body_sq" required rows={12} defaultValue={initial?.body_sq ?? ""} />
      </div>

      <div className="field">
        <label>Body (EN)</label>
        <textarea name="body_en" rows={8} defaultValue={initial?.body_en ?? ""} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Statusi</label>
          <select name="status" defaultValue={initial?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Tags (ndaras me presje)</label>
          <input name="tags" defaultValue={(initial?.tags ?? []).join(", ")} placeholder="rrugë, gara, junior" />
        </div>
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>
          {pending ? "Duke ruajtur..." : submitLabel}
        </button>
        <Link href="/admin/news" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
