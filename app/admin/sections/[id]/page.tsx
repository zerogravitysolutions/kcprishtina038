import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { updateSection } from "../actions";
// A COMPONENT import from a "use client" module — safe in an RSC (a value
// import would not be).
import { NumericInput } from "@/components/admin/NumericInput";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Section = {
  id: string;
  slug: string;
  display_order: number;
  name_sq: string;
  description_sq: string | null;
  coach_id: string | null;
  active: boolean;
};

type CoachOption = { id: string; full_name: string; role: string };

export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const { id } = await params;
  const supabase = await createClient();
  const { data: sec } = await supabase.from("sections")
    .select("id, slug, display_order, name_sq, description_sq, coach_id, active")
    .eq("id", id).maybeSingle();
  const row = sec as Section | null;
  if (!row) notFound();

  const { data: coachesData } = await supabase.from("profiles")
    .select("id, full_name, role")
    .in("role", ["coach", "admin"])
    .order("full_name");
  const coaches = (coachesData as CoachOption[] | null) ?? [];

  const bound = updateSection.bind(null, row.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ndrysho: {row.name_sq}</h1>
          <div className="sub">/{row.slug}</div>
        </div>
      </div>
      <form action={bound} style={{ display: "grid", gap: 16, maxWidth: 920 }}>
        <div className="field">
          <label>Emri *</label>
          <input name="name_sq" required defaultValue={row.name_sq} />
        </div>

        <div className="field">
          <label>Përshkrimi</label>
          <textarea name="description_sq" rows={5} defaultValue={row.description_sq ?? ""} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px", gap: 16, alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Trajneri</label>
            <select name="coach_id" defaultValue={row.coach_id ?? ""}>
              <option value="">— Pa trajner —</option>
              {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.full_name} ({c.role})</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="se-order">Renditja</label>
            <NumericInput id="se-order" name="display_order" kind="int" defaultValue={row.display_order} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Statusi</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>
              <input type="checkbox" name="active" defaultChecked={row.active} />
              {row.active ? "Aktiv" : "Joaktiv"}
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-ember">Ruaj ndryshimet</button>
          <Link href="/admin/sections" className="btn btn-ghost">Anulo</Link>
        </div>
      </form>
    </>
  );
}
