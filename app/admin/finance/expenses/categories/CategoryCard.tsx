"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { NumericInput } from "@/components/admin/NumericInput";
import { actionError } from "@/lib/errors";
import { createCategory, deleteCategory, updateCategory } from "./actions";

export type CategoryView = {
  id: string;
  code: string;
  name_sq: string;
  description_sq: string | null;
  display_order: number;
  active: boolean;
  /** Expenses filed under it. A used category is retired, never deleted. */
  expense_count: number;
};

const labelInline: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, textTransform: "none",
  letterSpacing: 0, fontSize: 13, fontFamily: "var(--font-body)", color: "var(--text-2)",
};

export function CategoryCard({ category }: { category: CategoryView }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState(category.name_sq);
  const [description, setDescription] = useState(category.description_sq ?? "");
  const [order, setOrder] = useState(String(category.display_order));
  const [active, setActive] = useState(category.active);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [delOpen, setDelOpen] = useState(false);

  function save() {
    setMsg(null);
    start(async () => {
      try {
        const r = await updateCategory(category.id, {
          name_sq: name, description_sq: description, display_order: order, active,
        });
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setMsg({ ok: true, text: "Kategoria u ruajt." });
        router.refresh();
      } catch (e) {
        const text = actionError(e, "Ruajtja e kategorisë dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{category.name_sq}</h3>
        <span className="kicker">{category.code}</span>
      </div>

      <div className="mono" style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`badge-st ${category.active ? "ok" : "neutral"}`}>
          {category.active ? "Aktive" : "Joaktive"}
        </span>
        <span className="badge-st neutral">
          {category.expense_count} {category.expense_count === 1 ? "shpenzim" : "shpenzime"}
        </span>
      </div>

      <div className="field">
        <label htmlFor={`cn-${category.id}`}>Emri</label>
        <input id={`cn-${category.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor={`cd-${category.id}`}>Përshkrimi</label>
        <textarea
          id={`cd-${category.id}`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`co-${category.id}`}>Renditja</label>
        <NumericInput id={`co-${category.id}`} kind="int" value={order} onChange={setOrder} />
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          Numri më i vogël del më lart në listën e kategorive.
        </div>
      </div>

      <div className="field">
        <label style={labelInline}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Shfaqet kur regjistrohet një shpenzim i ri
        </label>
        {!active ? (
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            Shpenzimet e vjetra e ruajnë këtë kategori; të rejat nuk mund ta zgjedhin më.
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ember btn-sm" onClick={save} disabled={pending}>
          {pending ? "Duke ruajtur…" : "Ruaj"}
        </button>
        {category.expense_count === 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDelOpen(true)} disabled={pending}>
            Fshij
          </button>
        ) : null}
      </div>
      {msg ? <div className={`mm-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

      <ConfirmModal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Fshij kategorinë"
        tone="danger"
        confirmLabel="Fshij"
        message={
          <>
            Kategoria <strong>{category.name_sq}</strong> nuk përdoret nga asnjë shpenzim dhe do të
            hiqet përgjithmonë.
          </>
        }
        onConfirm={async () => {
          try {
            const r = await deleteCategory(category.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
          } catch (e) {
            const text = actionError(e, "Fshirja e kategorisë dështoi. Provo sërish.");
            if (!text) { router.refresh(); return { ok: true as const }; }
            return { ok: false as const, error: text };
          }
        }}
      />
    </div>
  );
}

export function NewCategoryCard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function create() {
    setMsg(null);
    start(async () => {
      try {
        const r = await createCategory({
          name_sq: name, description_sq: description, display_order: order, active: true,
        });
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setName(""); setDescription(""); setOrder("");
        setMsg({ ok: true, text: "Kategoria u krijua." });
        router.refresh();
      } catch (e) {
        const text = actionError(e, "Krijimi i kategorisë dështoi. Provo sërish.");
        if (text) setMsg({ ok: false, text });
        else router.refresh();
      }
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Kategori e re</h3>
        <span className="kicker">shtim</span>
      </div>

      <div className="field">
        <label htmlFor="new-cat-name">Emri</label>
        <input
          id="new-cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="p.sh. Fizioterapi"
        />
      </div>

      <div className="field">
        <label htmlFor="new-cat-desc">Përshkrimi</label>
        <textarea
          id="new-cat-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Çfarë hyn në këtë kategori"
        />
      </div>

      <div className="field">
        <label htmlFor="new-cat-order">Renditja</label>
        <NumericInput id="new-cat-order" kind="int" value={order} onChange={setOrder} placeholder="p.sh. 120" />
      </div>

      <button type="button" className="btn btn-ember btn-sm" onClick={create} disabled={pending || !name.trim()}>
        {pending ? "Duke krijuar…" : "Krijo kategorinë"}
      </button>
      {msg ? <div className={`mm-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
    </div>
  );
}
