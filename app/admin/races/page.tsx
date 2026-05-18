import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  slug: string;
  name: string;
  race_date: string;
  location: string | null;
  race_type: string | null;
  organizer: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  road: "Rrugore",
  mtb: "MTB",
  tt: "Kronometër",
  stage: "Etapa",
  gravel: "Gravel",
  cyclocross: "Cyclocross",
};

export default async function RacesAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("race_events")
    .select("id, slug, name, race_date, location, race_type, organizer")
    .order("race_date", { ascending: false }).limit(300);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div><h1>Garat</h1><div className="sub">{rows.length} në bazë · katalog i kuruar i garave të klubit</div></div>
        <Link className="btn btn-ember" href="/admin/races/new">+ Gara e re</Link>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Emri</th><th>Data</th><th>Vendi</th><th>Tipi</th><th>Organizatori</th><th>Veprime</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka gara — shtoni një.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/races/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 2 }}>/races/{r.slug}</small>
                  </td>
                  <td className="mono">{new Date(r.race_date).toLocaleDateString("sq")}</td>
                  <td>{r.location ?? "—"}</td>
                  <td className="mono">{r.race_type ? (TYPE_LABEL[r.race_type] ?? r.race_type) : "—"}</td>
                  <td>{r.organizer ?? "—"}</td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/races/${r.id}`}>Edit</Link>
                    <DeleteButton id={r.id} name={r.name} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
