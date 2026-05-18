"use client";

import { useState, useTransition } from "react";
import { toggleResultsPublished } from "../signups/actions";

export function PublishToggle({
  eventId, initial, eventSlug, publishedAt,
}: {
  eventId: string;
  initial: boolean;
  eventSlug: string | null;
  publishedAt: string | null;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    const next = !on;
    setMsg(null);
    start(async () => {
      const r = await toggleResultsPublished(eventId, next);
      if (r.ok) {
        setOn(next);
        setMsg({
          ok: true,
          text: next ? "Rezultatet u publikuan ✓" : "Rezultatet u tërhoqën",
        });
        setTimeout(() => setMsg(null), 1800);
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 16,
        padding: "16px 18px",
        background: on ? "color-mix(in oklab, var(--ok) 12%, transparent)" : "var(--paper-2)",
        border: on
          ? "1px solid color-mix(in oklab, var(--ok) 40%, transparent)"
          : "1px solid var(--line)",
        borderRadius: 10,
        marginBottom: 24,
      }}
    >
      <div>
        <div
          className="mono"
          style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: on ? "var(--ok)" : "var(--ink-3)" }}
        >
          {on ? "Publikuar" : "I padukshëm publikisht"}
        </div>
        <div style={{ marginTop: 4, fontSize: 14, color: "var(--ink)" }}>
          {on ? (
            <>
              Rezultatet po shfaqen në{" "}
              {eventSlug ? (
                <a
                  href={`/events/${eventSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ember)" }}
                >
                  faqen publike
                </a>
              ) : (
                "faqen publike"
              )}
              {publishedAt && (
                <span className="mono" style={{ marginLeft: 8, color: "var(--ink-3)", fontSize: 12 }}>
                  · {new Date(publishedAt).toLocaleString("sq-AL", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
              . Formulari i regjistrimit është mbyllur.
            </>
          ) : (
            <>Rezultatet janë vetëm në admin. Aktivizo për t&apos;i bërë publike (formulari i regjistrimit zhduket automatikisht).</>
          )}
        </div>
        {msg && (
          <div
            className="mono"
            style={{
              marginTop: 6, fontSize: 11,
              color: msg.ok ? "var(--ok)" : "var(--err)",
            }}
          >
            {msg.text}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={on ? "btn btn-ghost btn-sm" : "btn btn-ember btn-sm"}
      >
        {pending ? "…" : on ? "Tërhiq" : "Publiko rezultatet"}
      </button>
    </div>
  );
}
