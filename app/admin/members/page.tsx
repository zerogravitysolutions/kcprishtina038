import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RolePicker } from "../staff/RolePicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; full_name: string; email: string; role: string; status: string; joined_at: string | null; section: { slug: string; name_sq: string } | null };

function initials(n: string) { return n.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?"; }

export default async function MembersPage() {
  // Build ONE client for this request and reuse it for both the auth check
  // and the data query. createClient() builds a fresh client per call which
  // means the auth-state populated by getProfile() doesn't carry over —
  // the second call's auth refresh fails silently in Server Components,
  // so the data query can run unauthenticated → RLS denies all rows.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileRow as { id: string; role: string; status: string } | null;
  if (!profile) redirect("/login");
  const canChangeRole = profile.role === "admin";

  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, email, role, status, joined_at, section:sections(slug, name_sq)")
    .order("joined_at", { ascending: false, nullsFirst: false }).limit(500);
  const rows = (data as Row[] | null) ?? [];
  // Also call the RLS helpers directly so we can see what current_role/has_role
  // evaluate to for this cookie-authenticated session.
  const supabaseAny = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const [{ data: curRole, error: errRole }, { data: isStaff, error: errStaff }, { data: noFilterCount }] = await Promise.all([
    supabaseAny.rpc("current_role"),
    supabaseAny.rpc("has_role", { roles: ["admin", "editor", "staff", "coach"] }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const diag = {
    user: user.id,
    profileRole: profile.role,
    rowCount: rows.length,
    error: error?.message ?? null,
    rpcCurrentRole: curRole,
    rpcCurrentRoleErr: errRole?.message ?? null,
    rpcHasRole: isStaff,
    rpcHasRoleErr: errStaff?.message ?? null,
    headCount: noFilterCount,
  };
  console.log("[admin/members]", diag);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <div className="sub">{rows.length} në bazë · admin mund të ndryshojë rolin direkt këtu</div>
        </div>
      </div>
      <pre style={{ fontSize: 11, background: "#fff", padding: 10, border: "1px solid #ccc", overflow: "auto", marginBottom: 16 }}>
        DIAG: {JSON.stringify(diag, null, 2)}
      </pre>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Rider</th><th>Section</th><th>Role</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka anëtarë.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td><div className="person"><div className="avatar">{initials(r.full_name)}</div><div className="nm">{r.full_name}<small>{r.email}</small></div></div></td>
                  <td>{r.section ? <span className={`tag-sec ${r.section.slug}`}>{r.section.name_sq}</span> : "—"}</td>
                  <td>
                    {canChangeRole
                      ? <RolePicker id={r.id} current={r.role} name={r.full_name} />
                      : <span className="mono">{r.role}</span>}
                  </td>
                  <td className="mono">{r.joined_at ? new Date(r.joined_at).toLocaleDateString("sq", { month: "short", year: "numeric" }) : "—"}</td>
                  <td><span className={`badge-st ${r.status === "active" ? "ok" : r.status === "pending" ? "warn" : "err"}`}>{r.status}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
