import { redirect } from "next/navigation";

// "Anëtarët (llogaritë)" and "Ekipi (publik)" were two lists of the same
// people, split by which identity table they happened to live in. They are now
// one screen. Bookmarks and old links must not 404.
export default function MembersRedirect() {
  redirect("/admin/people");
}
