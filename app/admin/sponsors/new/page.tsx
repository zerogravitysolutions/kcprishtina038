import { getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createSponsor } from "../actions";
import { SponsorForm } from "../SponsorForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewSponsorPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  return (
    <>
      <div className="page-head"><div><h1>Sponsor i ri</h1></div></div>
      <SponsorForm action={createSponsor} submitLabel="Krijo sponsorin" />
    </>
  );
}
