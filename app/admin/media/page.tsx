import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { id: string; storage_path: string; filename: string; alt: string | null; byte_size: number | null; created_at: string };

export default async function MediaAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("media").select("id, storage_path, filename, alt, byte_size, created_at").order("created_at", { ascending: false }).limit(48);
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Media library</h1><div className="sub">{rows.length} skedarë</div></div></div>
      {rows.length === 0 ? (
        <p style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Mediateka është bosh. (Ngarkimi i imazhit bëhet në v2; deri atëherë përdorni Supabase Dashboard → Storage → media.)
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {rows.map(r => {
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${r.storage_path}`;
            return (
              <div key={r.id} style={{ background: "var(--white)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <img src={url} alt={r.alt ?? r.filename} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", background: "var(--paper)" }} loading="lazy" />
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.filename}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4 }}>{Math.round((r.byte_size ?? 0) / 1024)} KB</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
