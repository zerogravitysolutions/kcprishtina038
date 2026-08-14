/**
 * Shared values for the Skedarët tab strip.
 *
 * A plain module on purpose: a Server Component may import components and types
 * from a "use client" file, never VALUES — RSC swaps the module for a proxy, so
 * an imported constant throws on .trim() and every === silently reads false.
 */

export type FilesView = "foto" | "dokumente";

/** Both halves are gated identically at the page and in RLS. */
export const FILES_ROLES = ["admin", "editor"];

export const FILES_BASE = "/admin/files";

/** The media grid's own filters, carried along so a tab flip doesn't reset them. */
export type FilesWindow = { src?: string; page?: string };

export function parseFilesView(v: string | undefined): FilesView {
  return v === "dokumente" ? "dokumente" : "foto";
}

/**
 * Every link inside Skedarët, built in one place. "foto" is the default view
 * and is left out of the querystring; the src/page params belong to it only, so
 * they are dropped when linking to the documents tab.
 */
export function filesHref(view: FilesView, w: FilesWindow = {}): string {
  const params = new URLSearchParams();
  if (view !== "foto") params.set("v", view);
  if (view === "foto") {
    if (w.src && w.src !== "all") params.set("src", w.src);
    if (w.page && w.page !== "1") params.set("page", w.page);
  }
  const s = params.toString();
  return s ? `${FILES_BASE}?${s}` : FILES_BASE;
}
