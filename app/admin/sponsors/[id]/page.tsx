import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { updateSponsor } from "../actions";
import { SponsorForm } from "../SponsorForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string;
  tier: string;
  role_sq: string | null;
  role_en: string | null;
  body_sq: string | null;
  body_en: string | null;
  website_url: string | null;
  contract_start: string | null;
  contract_end: string | null;
  display_order: number;
  active: boolean;
};

export default async function EditSponsorPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("sponsors")
    .select("id, name, tier, role_sq, role_en, body_sq, body_en, website_url, contract_start, contract_end, display_order, active")
    .eq("id", id).maybeSingle();
  const row = data as Row | null;
  if (!row) notFound();

  const bound = updateSponsor.bind(null, row.id);
  return (
    <>
      <div className="page-head"><div><h1>Edit: {row.name}</h1></div></div>
      <SponsorForm action={bound} initial={row} submitLabel="Ruaj ndryshimet" />
    </>
  );
}
