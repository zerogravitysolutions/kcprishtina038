import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateNews } from "../actions";
import { NewsForm } from "../NewsForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  slug: string;
  title_sq: string;
  title_en: string | null;
  body_sq: string;
  body_en: string | null;
  status: string;
  tags: string[];
};

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("news")
    .select("id, slug, title_sq, title_en, body_sq, body_en, status, tags")
    .eq("id", id).maybeSingle();
  const row = data as Row | null;
  if (!row) notFound();

  const bound = updateNews.bind(null, row.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit: {row.title_sq}</h1>
          <div className="sub">/news/{row.slug}</div>
        </div>
        <a className="btn btn-ghost" href={`/news/${row.slug}`} target="_blank">View ↗</a>
      </div>
      <NewsForm
        action={bound}
        initial={{
          title_sq: row.title_sq,
          title_en: row.title_en,
          body_sq: row.body_sq,
          body_en: row.body_en,
          status: row.status,
          tags: row.tags ?? [],
          slug: row.slug,
        }}
        submitLabel="Ruaj ndryshimet"
      />
    </>
  );
}
