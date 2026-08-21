import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Eventet" };

type Row = { id: string; title_sq: string; type: string; status: string; source: string | null; start_at: string; location: string | null; section: { name_sq: string } | null };

// Display-only labels — the DB values stay `race` / `ride` / `camp` / `training`.
const TYPE_LABEL: Record<string, string> = {
  race: "Garë",
  ride: "Dalje",
  camp: "Kamp",
  training: "Stërvitje",
};

// Display-only labels — the DB values stay `draft` / `published` / …
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Publikuar",
  cancelled: "Anuluar",
  done: "Përfunduar",
};

export default async function EventsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // admin + editor everywhere under /admin/events, matching events_write_editor.
  // A coach could reach this screen and edit, but the database refused the write.
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("events")
    .select("id, title_sq, type, status, source, start_at, location, section:sections(name_sq)")
    .order("start_at", { ascending: false }).limit(200);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div><h1>Eventet</h1><div className="sub">{rows.length} në bazë</div></div>
        <Link className="btn btn-ember" href="/admin/events/new">+ Event i ri</Link>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Titulli</th><th>Lloji</th><th>Seksioni</th><th>Fillimi</th><th>Burimi</th><th>Statusi</th><th>Veprime</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={7} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka evente — krijo një të ri.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/events/${r.id}`} style={{ fontWeight: 600 }}>{r.title_sq}</Link>
                    <small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 2 }}>{r.location ?? "—"}</small>
                  </td>
                  <td className="mono">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td>{r.section?.name_sq ?? "—"}</td>
                  <td className="mono">{new Date(r.start_at).toLocaleDateString("sq")}</td>
                  <td className="mono" style={{ textTransform: "uppercase", fontSize: 10.5 }}>{r.source ?? "native"}</td>
                  <td><span className={`badge-st ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "err"}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/events/${r.id}`}>Ndrysho</Link>
                    <Link className="btn btn-ghost btn-sm" href={`/admin/events/${r.id}/signups`}>Regjistrimet</Link>
                    <Link className="btn btn-ghost btn-sm" href={`/admin/events/${r.id}/results`}>Rezultatet</Link>
                    <DeleteButton id={r.id} title={r.title_sq} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
