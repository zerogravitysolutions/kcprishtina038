/**
 * Client-side image shrinking, for photos taken on a phone.
 *
 * WHY THIS RUNS IN THE BROWSER AND NOT ON THE SERVER
 * --------------------------------------------------
 * A photo from a current phone is 3–12 MB. Compressing it server-side would
 * still mean pushing those 12 MB up a mobile connection inside a bike shop
 * first — 30–60 s of a button that looks broken, on a data plan the club pays
 * for, and past the 1 MB body limit a Next.js Server Action accepts anyway.
 * Shrinking before the bytes ever leave the device is the whole point.
 *
 * The server re-checks size and MIME regardless. This module is a courtesy to
 * the network, never a security boundary.
 *
 * Browser-only: it touches createImageBitmap / <canvas> / URL and must be
 * called from an event handler in a client component, never during render.
 */

export type CompressOk = {
  ok: true;
  file: File;
  /** Size of what the user picked. */
  originalBytes: number;
  /** Size of what will actually be uploaded. */
  bytes: number;
  width: number;
  height: number;
  /** false = the original was already small enough and is passed through. */
  changed: boolean;
  /** true = we shrank as far as we sensibly could and it is STILL over target. */
  overTarget: boolean;
};

export type CompressFail = {
  ok: false;
  /** "decode" = the browser cannot read this format at all (HEIC on Android /
   *  desktop Chrome is the real case). "encode" = canvas produced nothing. */
  reason: "decode" | "encode";
  originalBytes: number;
};

export type CompressResult = CompressOk | CompressFail;

export type CompressOptions = {
  /** Longest edge of the output, in CSS pixels. */
  maxEdge: number;
  /** Stop as soon as the encoded blob is at or under this. */
  targetBytes: number;
  /** Never return something bigger than this, even unencodable — the caller
   *  decides what to tell the user. */
  hardMaxBytes: number;
};

/**
 * Attempts, in order. Each pass is one canvas draw plus one encode, so the
 * list is kept short: a mid-range phone spends ~150–400 ms per pass on a 12 MP
 * image, and six passes is already a second of thumb-twiddling.
 *
 * The quality ladder comes before the size ladder on purpose — a receipt read
 * at 1600px/q0.55 stays sharper than the same slip at 1024px/q0.8, because the
 * thing that has to survive is thin printed TEXT, which loses to resampling
 * long before it loses to JPEG ringing.
 */
const PASSES: { edgeScale: number; quality: number }[] = [
  { edgeScale: 1, quality: 0.8 },
  { edgeScale: 1, quality: 0.65 },
  { edgeScale: 1, quality: 0.5 },
  { edgeScale: 0.8, quality: 0.6 },
  { edgeScale: 0.62, quality: 0.55 },
  { edgeScale: 0.5, quality: 0.5 },
];

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

/**
 * EXIF ORIENTATION, the bug that makes every portrait receipt come out on its
 * side.
 *
 * Both decode paths below produce an already-upright image on every browser
 * this admin panel supports:
 *   - createImageBitmap(blob, { imageOrientation: "from-image" }) applies the
 *     EXIF rotation itself (Chrome 79+, Firefox 77+, Safari 15+).
 *   - <img> has applied EXIF orientation by default since the CSS
 *     `image-orientation: from-image` initial value shipped (Chrome 81,
 *     Firefox 77, Safari 13.1), so drawImage() of a loaded <img> is upright too.
 * Nothing here reads the EXIF block by hand, because on these engines doing so
 * would rotate an already-rotated image.
 */
async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // HEIC on a non-Apple engine lands here, and so does old Safari that
      // rejects the options bag. Fall through to the <img> path, which can
      // still decode HEIC on iOS because it goes through the system codec.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      URL.revokeObjectURL(url);
      return null;
    }
    return { source: img, width, height, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function fittedSize(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w, h };
  const k = maxEdge / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Shrink `file` to a JPEG at or under `targetBytes`, keeping the best quality
 * that fits. Returns the ORIGINAL untouched when it is already small enough,
 * so a 90 KB photo is not needlessly re-encoded (and loses nothing to a second
 * generation of JPEG artefacts).
 */
export async function compressImage(
  file: File,
  { maxEdge, targetBytes, hardMaxBytes }: CompressOptions,
): Promise<CompressResult> {
  const originalBytes = file.size;

  // Already small and already a format everything can display: leave it alone.
  if (file.type === "image/jpeg" && originalBytes <= targetBytes) {
    return {
      ok: true, file, originalBytes, bytes: originalBytes,
      width: 0, height: 0, changed: false, overTarget: false,
    };
  }

  const decoded = await decode(file);
  if (!decoded) return { ok: false, reason: "decode", originalBytes };

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "encode", originalBytes };

    let best: { blob: Blob; w: number; h: number } | null = null;

    for (const pass of PASSES) {
      const { w, h } = fittedSize(
        decoded.width, decoded.height, Math.round(maxEdge * pass.edgeScale),
      );
      canvas.width = w;
      canvas.height = h;
      // A transparent PNG (a screenshot of a bank confirmation, say) would
      // otherwise come out with black where the transparency was.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, w, h);

      const blob = await encode(canvas, pass.quality);
      if (!blob) continue;
      if (!best || blob.size < best.blob.size) best = { blob, w, h };
      if (blob.size <= targetBytes) break;
    }

    if (!best) return { ok: false, reason: "encode", originalBytes };

    // Pathological case: a tiny source that JPEG cannot beat (a 40 KB PNG of
    // flat colour can encode LARGER as a photo). Keep whichever is smaller,
    // as long as the original is a format the server accepts.
    if (file.type === "image/jpeg" && originalBytes <= best.blob.size) {
      return {
        ok: true, file, originalBytes, bytes: originalBytes,
        width: decoded.width, height: decoded.height, changed: false,
        overTarget: originalBytes > targetBytes,
      };
    }

    const out = new File([best.blob], "fatura.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return {
      ok: true,
      file: out,
      originalBytes,
      bytes: out.size,
      width: best.w,
      height: best.h,
      changed: true,
      overTarget: out.size > Math.min(targetBytes, hardMaxBytes),
    };
  } finally {
    decoded.release();
  }
}
