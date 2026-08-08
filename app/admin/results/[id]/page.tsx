import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateResult } from "../actions";
import { ResultForm } from "../ResultForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  event_id: string;
  category_id: string | null;
  member_id: string | null;
  rider_name_override: string | null;
  position: number | null;
  time_seconds: number | null;
  points: number | null;
  notes: string | null;
};

export default async function EditResultPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: res }, { data: evs }, { data: cats }, { data: mems }] = await Promise.all([
    supabase.from("results").select("id, event_id, category_id, member_id, rider_name_override, position, time_seconds, points, notes").eq("id", id).maybeSingle(),
    supabase.from("events").select("id, title_sq, start_at").order("start_at", { ascending: false }).limit(500),
    supabase.from("event_categories").select("id, name, event_id"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const row = res as Row | null;
  if (!row) notFound();

  const bound = updateResult.bind(null, row.id);

  return (
    <>
      <div className="page-head"><div><h1>Ndrysho rezultatin</h1></div></div>
      <ResultForm
        action={bound}
        events={(evs as { id: string; title_sq: string; start_at: string }[] | null) ?? []}
        categories={(cats as { id: string; name: string; event_id: string }[] | null) ?? []}
        members={(mems as { id: string; full_name: string }[] | null) ?? []}
        initial={row}
        submitLabel="Ruaj ndryshimet"
      />
    </>
  );
}
