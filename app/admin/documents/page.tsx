import { redirect } from "next/navigation";

// The document library is now the "Dokumentet" view of /admin/files, next to
// the photo grid — same shape, same admin + editor gate, one nav row instead of
// two. Bookmarks and old links must not 404.
//
// app/admin/documents/actions.ts stays here and is imported by the upload form
// and the row actions under /admin/files: it is a server-action module
// boundary, not a route.
//
// redirect (307), never permanentRedirect: a 308 would be cached in the owner's
// browser forever if the panel is reorganised again.
export default function DocumentsRedirect() {
  redirect("/admin/files?v=dokumente");
}
