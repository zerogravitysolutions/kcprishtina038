/**
 * Everything both sides of the receipt-photo feature have to agree on.
 *
 * PLAIN MODULE ON PURPOSE — no "use client", no "use server". The page (a
 * Server Component), the form (a client component) and actions.ts (a Server
 * Action module) all import VALUES from here. Values imported from a
 * "use client" module reach a Server Component as a proxy object, where
 * `RECEIPT_MAX_BYTES` is not a number and every `===` reads false; and a
 * "use server" module may only export async functions. A plain module is the
 * one shape all three can share.
 */

/** Path prefix inside the `media` bucket. The storage policies added in
 *  migration 20260811000001 are scoped to exactly this. */
export const RECEIPT_PREFIX = "receipts/";

/**
 * What the server accepts. HEIC/HEIF is deliberately absent: Chrome, Firefox
 * and every non-Apple viewer cannot render it, so storing one would produce a
 * receipt that only the owner's own phone can open. The client converts to
 * JPEG before uploading; when it cannot (see compressImage), the user is told
 * so in Albanian instead of a broken thumbnail appearing later.
 */
export const RECEIPT_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Hard ceiling for what the Server Action will accept.
 *
 * This number is NOT a UX preference, it is a platform limit: a Next.js Server
 * Action rejects a request body over `serverActions.bodySizeLimit`, which
 * defaults to 1 MB and is not raised in next.config.mjs. Anything larger fails
 * with an opaque platform error rather than one of our Albanian sentences, so
 * the client is told to stay well under it and the server repeats the check.
 */
export const RECEIPT_MAX_BYTES = 800 * 1024;

/**
 * What the client aims for after compression.
 *
 * A receipt only has to be READABLE, and a 1600px-wide JPEG at q0.8 of a till
 * slip lands around 200–400 KB — comfortably legible, roughly 20× smaller than
 * the 3–12 MB original a modern phone hands over, and ~2 s instead of ~40 s on
 * the kind of mobile data you get inside a bike shop.
 */
export const RECEIPT_TARGET_BYTES = 500 * 1024;

/** Long edge after downscaling. A4 text at 1600px is ~190 dpi — well past the
 *  point where a thermal receipt is comfortably readable on screen. */
export const RECEIPT_MAX_EDGE = 1600;

/**
 * What the bytes ACTUALLY are, read from the file's magic number.
 *
 * `File.type` in a multipart body is nothing but a header the client wrote, so
 * the allowlist above is a statement of intent until something reads the
 * content. Two cases this catches that the declared type does not:
 *   - the honest one: a document renamed `fatura.jpg`, which the OS labels
 *     image/jpeg and the browser hands over untouched when it is already small
 *     enough to skip compression. It would upload, and then render as a broken
 *     thumbnail on the expense forever.
 *   - the hostile one: a hand-made POST to this Server Action, storing whatever
 *     it likes in the club's public bucket under an image content type.
 *
 * Returns the real MIME, or null when the bytes are not one of the three
 * formats the bucket accepts.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  // JPEG: SOI marker.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: \x89PNG\r\n\x1a\n
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) return "image/png";
  // WebP: "RIFF" ....(size).... "WEBP"
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Extension for an allowed MIME type. Mirrors safeExt() in app/join/actions.ts. */
export function receiptExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * The same shape as the per-element regex in club_expenses_receipt_paths_ok().
 * Checked in the Server Action too, so a hand-made POST cannot make the row
 * point at another bucket prefix and cannot make the delete path remove
 * somebody else's object.
 */
const RECEIPT_PATH_RE = /^receipts\/[0-9a-f]{32}\.(jpg|png|webp)$/;

export function isReceiptPath(value: string | null | undefined): boolean {
  return typeof value === "string" && RECEIPT_PATH_RE.test(value);
}

/**
 * How many receipt photos one expense may carry. Mirrors the cardinality cap in
 * club_expenses_receipt_paths_ok() (migration 20260817000001): a purchase can
 * span a couple of till rolls plus an itemised breakdown, but three is the wall.
 */
export const RECEIPT_MAX_COUNT = 3;

/**
 * Validate the whole array the way the DB check does: at most RECEIPT_MAX_COUNT
 * elements, every one a well-formed receipts/ path. De-duped, because the same
 * object must never be listed twice on one row (it would be swept while still
 * referenced). Returns the cleaned array, or an error key for the caller to turn
 * into an Albanian sentence.
 */
export function validateReceiptPaths(
  value: unknown,
): { ok: true; paths: string[] } | { ok: false; reason: "shape" | "count" | "path" } {
  if (!Array.isArray(value)) return { ok: false, reason: "shape" };
  const paths: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return { ok: false, reason: "path" };
    if (!isReceiptPath(raw)) return { ok: false, reason: "path" };
    if (!paths.includes(raw)) paths.push(raw);
  }
  if (paths.length > RECEIPT_MAX_COUNT) return { ok: false, reason: "count" };
  return { ok: true, paths };
}

/** A fresh, unguessable object name — 128 bits, like app/join/actions.ts. */
export function newReceiptPath(mime: string): string {
  return `${RECEIPT_PREFIX}${crypto.randomUUID().replace(/-/g, "")}.${receiptExt(mime)}`;
}

/**
 * Public URL of a stored receipt. The `media` bucket is public (migration
 * 0009), so this is a plain object URL — the same construction MediaPicker
 * uses. Returns null when there is no photo, so callers can branch on the
 * value instead of rendering an <img> with an empty src.
 */
export function receiptPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!base) return null;
  return `${base}/storage/v1/object/public/media/${path}`;
}
