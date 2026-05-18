import { getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createNews } from "../actions";
import { NewsForm } from "../NewsForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewNewsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");

  return (
    <>
      <div className="page-head">
        <div><h1>Artikull i ri</h1><div className="sub">Krijo një artikull manual</div></div>
      </div>
      <NewsForm action={createNews} submitLabel="Krijo artikullin" />
    </>
  );
}
