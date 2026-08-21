import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingRow } from "./SettingRow";
import { NewSettingForm } from "./NewSettingForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Cilësimet" };

type Row = { key: string; value: unknown; updated_at: string };

export default async function SettingsAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value, updated_at").order("key");
  const rows = (data as Row[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div><h1>Cilësimet</h1><div className="sub">{rows.length} cilësime</div></div>
      </div>
      <NewSettingForm />
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th style={{ width: 240 }}>Çelësi</th><th>Vlera (JSON)</th><th style={{ width: 120 }}>Përditësuar</th><th style={{ width: 180 }}>Veprime</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={4} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka cilësime.</td></tr>
              : rows.map(r => <SettingRow key={r.key} row={r} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
