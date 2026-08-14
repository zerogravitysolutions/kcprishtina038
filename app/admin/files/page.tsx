import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { FotoView } from "./FotoView";
import { DokumenteView } from "./DokumenteView";
import { FILES_ROLES, filesHref, parseFilesView, type FilesView } from "./views";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Skedarët" };

/**
 * Every club file in one nav line and two views.
 *
 * "Biblioteka e medias" and "Dokumentet" were two top-level rows for the same
 * shape — a file, uploaded, given a URL — and the media half had no actions on
 * it at all: a paginated grid you can look at, with the real upload path living
 * inside components/admin/MediaPicker.tsx on the screens that need it. A viewer
 * does not earn a top-level line; the document CRUD stays one click away.
 *
 * Both halves are gated admin + editor at the page and by RLS
 * (media_write_editor and the documents policies), so the merge needs no
 * per-tab gating — the single check below is exactly what each old page did.
 *
 * Same ?v= tab pattern as /admin/finance/overview.
 */
type SearchParams = Promise<{ v?: string; src?: string; page?: string }>;

const VIEWS: Array<{ id: FilesView; label: string }> = [
  { id: "foto", label: "Fotot" },
  { id: "dokumente", label: "Dokumentet" },
];

export default async function FilesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!FILES_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const sp = await searchParams;
  const view = parseFilesView(sp.v);
  const src = sp.src ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Skedarët</h1>
          <div className="sub">
            {view === "foto"
              ? "Fotot e klubit — nga Facebook dhe nga ngarkimet. Fotot ngarkohen aty ku përdoren: te lajmet, eventet, sponsorët dhe shpenzimet."
              : "Rregulloret, vendimet dhe dokumentet e tjera të klubit — vetëm PDF."}
          </div>
        </div>
      </div>

      <nav className="filter-bar" aria-label="Pamjet e skedarëve">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            className={`chip ${view === v.id ? "active" : ""}`}
            href={filesHref(v.id)}
            aria-current={view === v.id ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "foto" ? <FotoView page={page} src={src} /> : <DokumenteView />}
    </>
  );
}
