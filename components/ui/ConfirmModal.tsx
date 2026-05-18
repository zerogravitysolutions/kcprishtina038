"use client";

import { useState, useTransition } from "react";
import { Modal } from "./Modal";

export type ConfirmTone = "danger" | "default";

export function ConfirmModal({
  open, onClose, title, message, confirmLabel = "Vazhdo", cancelLabel = "Anulo",
  tone = "default", onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Returns ok=true to close on success, or an error string to show. */
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }> | void | Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      const r = await onConfirm();
      if (r && typeof r === "object" && "ok" in r) {
        if (r.ok) onClose();
        else setErr(r.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "btn btn-ember btn-sm" : "btn btn-ember btn-sm"}
            onClick={run}
            disabled={pending}
            style={
              tone === "danger"
                ? { background: "var(--err)", borderColor: "var(--err)", color: "var(--paper)" }
                : undefined
            }
          >
            {pending ? "Duke proceduar…" : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }}>{message}</div>
      {err && (
        <div
          className="mono"
          style={{
            marginTop: 12, padding: "10px 12px",
            background: "color-mix(in oklab, var(--err) 10%, transparent)",
            color: "var(--err)", fontSize: 12, borderRadius: 6,
          }}
        >
          {err}
        </div>
      )}
    </Modal>
  );
}
