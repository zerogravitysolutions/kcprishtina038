"use client";

import { useTransition, useState } from "react";
import { addCategory, deleteCategory } from "./actions";

type Category = { id: string; name: string; max_riders: number | null; display_order: number };

export function CategoriesEditor({ eventId, categories }: { eventId: string; categories: Category[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    start(async () => {
      const r = await addCategory(eventId, fd);
      if (!r.ok) setErr(r.error ?? "Dështoi.");
      else form.reset();
    });
  }

  function onDel(cid: string, name: string) {
    if (!confirm(`Fshi kategorinë "${name}"?`)) return;
    start(async () => {
      const r = await deleteCategory(eventId, cid);
      if (!r.ok) alert(`Gabim: ${r.error}`);
    });
  }

  return (
    <>
      <form
        onSubmit={onAdd}
        style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 120px", gap: 12, alignItems: "end", marginBottom: 16, padding: 14, background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12 }}
      >
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Emri i kategorisë</label>
          <input name="name" required placeholder="Elite Men" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Max çiklistë</label>
          <input name="max_riders" type="number" min="1" placeholder="100" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Renditja</label>
          <input name="display_order" type="number" defaultValue={0} />
        </div>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "..." : "Shto"}</button>
        {err && <div style={{ gridColumn: "1 / -1", color: "var(--err)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{err}</div>}
      </form>

      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Emri</th><th>Max</th><th>Renditja</th><th>Veprimi</th></tr></thead>
          <tbody>
            {categories.length === 0
              ? <tr><td colSpan={4} style={{ padding: 16, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Pa kategori — rezultatet mund të jenë pa kategori.</td></tr>
              : categories.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.max_riders ?? "—"}</td>
                  <td className="mono">{c.display_order}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => onDel(c.id, c.name)} style={{ color: "var(--err)" }}>Fshi</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
