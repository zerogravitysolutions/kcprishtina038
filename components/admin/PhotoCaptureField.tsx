"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbox } from "@/components/ui/Lightbox";
import { compressImage } from "./imageCompress";

/**
 * Attach ONE photo, taken on the spot or picked from the library, shrunk in
 * the browser before it is uploaded.
 *
 * WHY THERE ARE TWO BUTTONS AND NOT ONE
 * -------------------------------------
 * `capture="environment"` is the attribute that opens the rear camera straight
 * away — and on iOS Safari and Android Chrome it also REMOVES the "choose an
 * existing photo" branch entirely. A single input carrying it would mean the
 * owner physically cannot attach a receipt he photographed an hour ago. A
 * single input WITHOUT it costs the shop case an extra tap in a system sheet.
 *
 * So there are two inputs behind two buttons, and the platform decides which
 * buttons are worth showing:
 *   - "Bëj foto"    → accept="image/*" capture="environment": straight to the
 *                     rear camera. Rendered only under
 *                     (hover: none) and (pointer: coarse) — see .pc-cam in
 *                     admin.css — because on a desktop `capture` is ignored and
 *                     the button would be a second, identical file picker.
 *   - "Zgjidh foto" → accept="image/*", NO capture: iOS Safari shows its
 *                     Photo Library / Take Photo / Choose File sheet, Android
 *                     Chrome shows its picker with the camera among the apps,
 *                     desktop shows the ordinary file dialog. Both routes stay
 *                     reachable everywhere even if the first button is hidden.
 *
 * Neither input is autofocused and neither is a text field, so nothing makes a
 * keyboard appear.
 */

export type PhotoUploadResult = { ok: true; path: string } | { ok: false; error: string };
export type PhotoRemoveResult = { ok: true } | { ok: false; error: string };

type Props = {
  label: string;
  /** One line under the buttons, in Albanian. */
  hint?: string;
  /** Storage path of the photo currently attached, or null. */
  path: string | null;
  /** URL the stored `path` is served from; ignored while a local preview is fresher. */
  previewUrl: string | null;
  /** Hands the compressed file to the server; resolves with the stored path. */
  onUpload: (file: File) => Promise<PhotoUploadResult>;
  /** Detaches the current photo. The caller decides whether the object dies now
   *  or when the form is saved. */
  onRemove: (path: string) => Promise<PhotoRemoveResult>;
  disabled?: boolean;
  /** Server-side ceiling, repeated here so the user hears about it instantly. */
  hardMaxBytes: number;
  targetBytes: number;
  maxEdge: number;
  /** The server's MIME allowlist, repeated so the degrade path below never
   *  passes through a format the upload is going to refuse anyway. */
  allowedMime: string[];
  /** Alt text / lightbox caption. */
  alt?: string;
};

type Phase = "idle" | "preparing" | "uploading" | "removing";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  preparing: "Duke përgatitur foton…",
  uploading: "Duke ngarkuar…",
  removing: "Duke hequr foton…",
};

function kb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PhotoCaptureField({
  label, hint, path, previewUrl, onUpload, onRemove, disabled,
  hardMaxBytes, targetBytes, maxEdge, allowedMime, alt,
}: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The bytes we already hold locally beat a round trip to the CDN on the same
  // mobile connection that just uploaded them. Keyed by path so a stale
  // preview can never be shown for a different photo.
  const [local, setLocal] = useState<{ url: string; path: string } | null>(null);
  const localUrlRef = useRef<string | null>(null);

  const dropLocal = useCallback(() => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = null;
    setLocal(null);
  }, []);

  useEffect(() => () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  }, []);

  /**
   * Escape belongs to the TOPMOST layer only.
   *
   * Lightbox listens on window and components/ui/Modal listens on document, so
   * with the viewer open above the expense form one Escape would close both —
   * and closing the form throws away everything typed so far and sweeps the
   * photo that was just uploaded. Capturing at the document, before either
   * bubble listener can run, keeps the key on the viewer.
   */
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setZoom(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [zoom]);

  const busy = phase !== "idle";
  const shown = local && local.path === path ? local.url : previewUrl;

  async function handleFile(file: File | null | undefined) {
    // Re-picking the SAME file has to fire onChange again, so both inputs are
    // cleared on every pass.
    if (camRef.current) camRef.current.value = "";
    if (libRef.current) libRef.current.value = "";
    if (!file) return;

    setError(null);
    setNote(null);
    setPhase("preparing");

    let upload = file;
    try {
      const shrunk = await compressImage(file, { maxEdge, targetBytes, hardMaxBytes });

      if (!shrunk.ok) {
        // HEIC/HEIF from an iPhone is the case this exists for: Chrome and
        // Firefox cannot decode it, so there is nothing to draw on a canvas.
        // We say so instead of uploading 12 MB or dropping the photo silently.
        const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
        // Pass the untouched original through only when it is small enough AND
        // in a format the server will actually take. A 4 MB HEIC, or a BMP,
        // gets a sentence instead — never a silent drop and never a 12 MB
        // upload on the club's mobile data.
        if (file.size <= hardMaxBytes && allowedMime.includes(file.type) && !heic) {
          upload = file;
          setNote(`Fotoja nuk u zvogëlua dot, po ngarkohet ashtu siç është (${kb(file.size)}).`);
        } else {
          setPhase("idle");
          setError(
            heic
              ? "Ky format fotoje (HEIC) nuk hapet dot nga shfletuesi. Në iPhone: Settings → Camera → Formats → “Most Compatible”, ose bëj një pamje të ekranit (screenshot) të fotos dhe ngarkoje atë."
              : `Kjo foto nuk u lexua dot dhe është ${kb(file.size)} — shumë e madhe për ta ngarkuar ashtu siç është. Provo një foto tjetër.`,
          );
          return;
        }
      } else {
        upload = shrunk.file;
        if (shrunk.changed) {
          setNote(`${kb(shrunk.originalBytes)} → ${kb(shrunk.bytes)}`);
        }
      }
    } catch {
      setPhase("idle");
      setError("Përgatitja e fotos dështoi. Provo sërish.");
      return;
    }

    if (upload.size > hardMaxBytes) {
      setPhase("idle");
      setError(
        `Fotoja mbetet ${kb(upload.size)} edhe pas zvogëlimit, mbi kufirin prej ${kb(hardMaxBytes)}. Provo ta bësh foton më afër faturës, pa sfond.`,
      );
      return;
    }

    setPhase("uploading");
    let result: PhotoUploadResult;
    try {
      result = await onUpload(upload);
    } catch {
      setPhase("idle");
      setError("Ngarkimi i fotos dështoi. Provo sërish.");
      return;
    }
    setPhase("idle");
    if (!result.ok) {
      setNote(null);
      setError(result.error);
      return;
    }

    dropLocal();
    const url = URL.createObjectURL(upload);
    localUrlRef.current = url;
    setLocal({ url, path: result.path });
  }

  async function handleRemove() {
    if (!path) return;
    setError(null);
    setNote(null);
    setPhase("removing");
    try {
      const r = await onRemove(path);
      if (!r.ok) { setError(r.error); return; }
      dropLocal();
    } catch {
      setError("Heqja e fotos dështoi. Provo sërish.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="field pc-field" role="group" aria-labelledby={labelId}>
      <label id={labelId}>{label}</label>

      {/* Hidden twins, and no id/htmlFor pairing: display:none keeps them out
          of the tab order, so the visible buttons are the only things a
          keyboard or a screen reader ever reaches. */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        tabIndex={-1}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        tabIndex={-1}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {shown ? (
        <div className="pc-has">
          <button
            type="button"
            className="pc-thumb"
            onClick={() => setZoom(true)}
            aria-label="Hap foton e faturës"
            title="Hap foton"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt={alt ?? "Fotoja e faturës"} />
          </button>
          <div className="pc-has-body">
            <div className="pc-actions">
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => libRef.current?.click()}
                disabled={disabled || busy}
              >
                Ndrysho foton
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch pc-cam"
                onClick={() => camRef.current?.click()}
                disabled={disabled || busy}
              >
                Bëj foto të re
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch pc-danger"
                onClick={() => void handleRemove()}
                disabled={disabled || busy}
              >
                Hiq foton
              </button>
            </div>
            {note ? <div className="pc-note mono">{note}</div> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="pc-actions">
            <button
              type="button"
              className="btn btn-ghost btn-touch pc-cam"
              onClick={() => camRef.current?.click()}
              disabled={disabled || busy}
            >
              <CameraIcon /> Bëj foto
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-touch"
              onClick={() => libRef.current?.click()}
              disabled={disabled || busy}
            >
              <PhotoIcon /> Zgjidh foto
            </button>
          </div>
          {hint ? <div className="pc-note mono">{hint}</div> : null}
        </>
      )}

      {busy ? (
        <div className="pc-progress" role="status" aria-live="polite">
          {/* Indeterminate on purpose: a Server Action is a fetch(), and a
              browser reports no upload progress for one. A fake percentage
              would be a lie; a moving bar plus the stage name is not. */}
          <div className="pc-bar"><i /></div>
          <span className="mono">
            {PHASE_LABEL[phase]}
            {phase === "uploading" && note ? ` · ${note}` : ""}
          </span>
        </div>
      ) : null}

      {error ? <div className="mm-msg err" style={{ marginTop: 8 }}>{error}</div> : null}

      {/* PORTALLED, AND THE WRAPPER'S z-index IS NOT DECORATION.
          This field usually lives inside components/ui/Modal, whose backdrop
          carries backdrop-filter — which makes it the containing block for
          every position:fixed descendant, so an in-place Lightbox would be
          measured against the dialog and then clipped by its overflow:hidden
          panel. Escaping to <body> fixes the geometry; the z-index above the
          Modal's own 9999 fixes the stacking, since Lightbox asks for 1000 and
          would otherwise open UNDER the form it was opened from. */}
      {mounted && zoom && shown
        ? createPortal(
            <div style={{ position: "relative", zIndex: 10000 }}>
              <Lightbox
                photos={[{ src: shown, alt: alt ?? "Fotoja e faturës" }]}
                openIndex={0}
                onClose={() => setZoom(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 6.5h3l1.2-2h6.6l1.2 2h3v9h-15v-9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13.5 7.2 9.6l3 2.6 2.8-2.4 4 3.7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="7" cy="7.6" r="1.2" fill="currentColor" />
    </svg>
  );
}
