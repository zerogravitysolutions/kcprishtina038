import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createResult } from "../actions";
import { ResultForm } from "../ResultForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewResultPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor","coach"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const [{ data: evs }, { data: cats }, { data: mems }] = await Promise.all([
    supabase.from("events").select("id, title_sq, start_at").order("start_at", { ascending: false }).limit(500),
    supabase.from("event_categories").select("id, name, event_id"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>Rezultat i ri</h1></div></div>
      <ResultForm
        action={createResult}
        events={(evs as { id: string; title_sq: string; start_at: string }[] | null) ?? []}
        categories={(cats as { id: string; name: string; event_id: string }[] | null) ?? []}
        members={(mems as { id: string; full_name: string }[] | null) ?? []}
        submitLabel="Krijo rezultatin"
      />
    </>
  );
}
