"use client";
import { useRef, useState, useTransition } from "react";
import { removeAvatar, uploadAvatar } from "./avatar-actions";

const SIZE = 512;

/** Center-crop to a square and shrink to 512 px JPEG before upload, so a
 * phone photo of several MB becomes ~100 KB. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob")), "image/jpeg", 0.88));
}

export function AvatarEditor({ name, initialUrl }: { name: string; initialUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    start(async () => {
      let blob: Blob;
      try { blob = await squareJpeg(file); }
      catch { setError("Kjo foto nuk mund të lexohet. Provo një JPG ose PNG."); return; }
      const data = new FormData();
      data.append("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      const result = await uploadAvatar(data);
      if (result.ok) setUrl(result.url); else setError(result.error);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{
        width: 88, height: 88, borderRadius: 999, overflow: "hidden", flexShrink: 0,
        background: "color-mix(in oklab, var(--teal, #6faaa8) 34%, #fff)", color: "var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, opacity: pending ? 0.6 : 1,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- user photo from Supabase Storage */}
        {url ? <img src={url} alt={name} width={88} height={88} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? "Duke ruajtur…" : url ? "Ndrysho foton" : "Shto foto"}
          </button>
          {url && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => {
            setError(null);
            const result = await removeAvatar();
            if (result.ok) setUrl(null); else setError(result.error);
          })}>Hiq foton</button>}
        </div>
        <span style={{ fontSize: 12, color: error ? "var(--ember-deep)" : "var(--ink-3)" }} role={error ? "alert" : undefined}>
          {error ?? "JPG, PNG ose WebP. Nëse lidh Strava-n, merret fotoja e profilit tënd atje."}
        </span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
    </div>
  );
}
