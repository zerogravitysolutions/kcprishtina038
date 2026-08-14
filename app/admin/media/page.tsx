import { redirect } from "next/navigation";

// "Biblioteka e medias" and "Dokumentet" were two nav rows for the same thing —
// a club file, uploaded, given a URL — behind the same admin + editor gate. They
// are now two views of /admin/files. Bookmarks and old links must not 404, and
// the source filter comes along with them.
//
// app/admin/media/actions.ts stays where it is: components/admin/MediaPicker.tsx
// imports uploadMediaFiles from this path, and that is the real upload route
// used by news, events, sponsors, team members and expenses.
//
// redirect (307), never permanentRedirect: a 308 would be cached in the owner's
// browser forever if the panel is reorganised again.
type SearchParams = Promise<{ src?: string; page?: string }>;

export default async function MediaRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { src } = await searchParams;
  redirect(src ? `/admin/files?v=foto&src=${encodeURIComponent(src)}` : "/admin/files");
}
