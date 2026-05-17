import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Row = { key: string; value: unknown; updated_at: string };

export default async function SettingsAdminPage() {
  const profile = (await getProfile())!;
  if (profile.role !== "admin") redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value, updated_at").order("key");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><div className="sub">{rows.length} cilësime</div></div></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Key</th><th>Value</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={3} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka cilësime.</td></tr>
              : rows.map(r => (
                <tr key={r.key}>
                  <td className="mono">{r.key}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(r.value)}</td>
                  <td className="mono">{new Date(r.updated_at).toLocaleDateString("sq")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
