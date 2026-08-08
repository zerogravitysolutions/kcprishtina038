"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { actionError } from "@/lib/errors";

type Event = { id: string; title_sq: string; start_at: string };
type Category = { id: string; name: string; event_id: string };
type Member = { id: string; full_name: string };

type Initial = {
  event_id: string;
  category_id: string | null;
  member_id: string | null;
  rider_name_override: string | null;
  position: number | null;
  time_seconds: number | null;
  points: number | null;
  notes: string | null;
};

export function ResultForm({ action, events, categories, members, initial, submitLabel }: {
  action: (f: FormData) => Promise<void>;
  events: Event[];
  categories: Category[];
  members: Member[];
  initial?: Initial;
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [eventId, setEventId] = useState(initial?.event_id ?? events[0]?.id ?? "");
  const eventCats = categories.filter(c => c.event_id === eventId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try { await action(fd); }
          catch (x) {
            const msg = actionError(x, "Ruajtja e rezultatit dështoi. Provo sërish.");
            if (msg) setErr(msg);
          }
        });
      }}
      style={{ display: "grid", gap: 16, maxWidth: 720 }}
    >
      <div className="field">
        <label>Eventi *</label>
        <select name="event_id" required value={eventId} onChange={e => setEventId(e.target.value)}>
          <option value="">— Zgjidh —</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {new Date(ev.start_at).toLocaleDateString("sq")} · {ev.title_sq}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Kategoria</label>
        <select name="category_id" defaultValue={initial?.category_id ?? ""}>
          <option value="">— Asnjë —</option>
          {eventCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Anëtar i klubit</label>
          <select name="member_id" defaultValue={initial?.member_id ?? ""}>
            <option value="">— Asnjë —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Ose emër çiklisti (jashtë klubit)</label>
          <input name="rider_name_override" defaultValue={initial?.rider_name_override ?? ""} placeholder="Mysafir" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 200px 120px", gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Pozicioni</label>
          <input name="position" type="number" min="1" defaultValue={initial?.position ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Koha (në sekonda)</label>
          <input name="time_seconds" type="number" min="0" defaultValue={initial?.time_seconds ?? ""} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Pikët</label>
          <input name="points" type="number" defaultValue={initial?.points ?? ""} />
        </div>
      </div>

      <div className="field">
        <label>Shënime</label>
        <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
      </div>

      {err && <div style={{ color: "var(--err)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Gabim: {err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-ember" disabled={pending}>{pending ? "Duke ruajtur…" : submitLabel}</button>
        <Link href="/admin/results" className="btn btn-ghost">Anulo</Link>
      </div>
    </form>
  );
}
