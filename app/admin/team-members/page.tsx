import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  slug: string;
  full_name: string;
  positions: string[];
  section_slug: string | null;
  status: string;
  display_order: number;
  photo: { storage_path: string } | null;
};

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

export default async function TeamMembersAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const sp = await searchParams;
  const status = sp.status === "past" ? "past" : "active";

  const supabase = await createClient();
  const { data } = await supabase.from("team_members")
    .select("id, slug, full_name, positions, section_slug, status, display_order, photo:media!photo_media_id(storage_path)")
    .eq("status", status)
    .order("display_order").order("last_name");
  const rows = (data as unknown as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div><h1>Ekipi</h1><div className="sub">{rows.length} {status === "active" ? "aktivë" : "ish-anëtarë"}</div></div>
        <Link className="btn btn-ember" href="/admin/team-members/new">+ Anëtar i ri</Link>
      </div>
      <div className="filter-bar" style={{ borderRadius: 12, border: "1px solid var(--line)", marginBottom: 12 }}>
        <Link className={`chip ${status === "active" ? "active" : ""}`} href="/admin/team-members">Aktivë</Link>
        <Link className={`chip ${status === "past"   ? "active" : ""}`} href="/admin/team-members?status=past">Ish-anëtarë</Link>
        <div className="spacer" />
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Anëtari</th><th>Pozicionet</th><th>Seksioni</th><th>Renditja</th><th>Veprime</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka anëtarë.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="person">
                      {r.photo ? (
                        <img className="avatar" src={`${SUPA}/storage/v1/object/public/media/${r.photo.storage_path}`} alt="" style={{ objectFit: "cover" }} />
                      ) : (
                        <div className="avatar">{initials(r.full_name)}</div>
                      )}
                      <div className="nm">
                        <Link href={`/admin/team-members/${r.id}`} style={{ fontWeight: 600 }}>{r.full_name}</Link>
                        <small>{r.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>{r.positions.join(" · ")}</td>
                  <td>{r.section_slug ? <span className={`tag-sec ${r.section_slug}`}>{r.section_slug}</span> : "—"}</td>
                  <td className="mono">{r.display_order}</td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/team-members/${r.id}`}>Ndrysho</Link>
                    <DeleteButton id={r.id} name={r.full_name} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
