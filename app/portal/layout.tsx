import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { signOut } from "./actions";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() || "?";
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/login");

  const supabase = await createClient();
  let sectionName: string | null = null;
  if (profile.section_id) {
    const { data } = await supabase.from("sections").select("name_sq").eq("id", profile.section_id).maybeSingle();
    sectionName = (data as { name_sq: string } | null)?.name_sq ?? null;
  }
  const roleLine = profile.role === "member" ? "Anëtar" : profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  const subline = sectionName ? `${roleLine} · ${sectionName}` : roleLine;

  return (
    <div className="portal-shell" style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}>
      <aside className="portal-side" style={{ background: "var(--paper-2)", borderRight: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", padding: "24px 16px", position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", gap: 4 }}>
        <Link href="/" className="brand" style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 20px" }}>
          <img src="/assets/logo.jpg" alt="" style={{ width: 32, height: 32, borderRadius: 999 }} />
          <div>
            <div className="kc" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Prishtina 038</div>
            <div className="sub" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 3 }}>Member portal</div>
          </div>
        </Link>
        <div className="group" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)", padding: "16px 8px 6px" }}>Hapësira jote</div>
        <Link className="nav-item" href="/portal">Paneli</Link>
        <Link className="nav-item" href="/portal/profile">Profili & dokumentet</Link>

        <div className="group" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)", padding: "16px 8px 6px" }}>Klubi</div>
        <Link className="nav-item" href={"/races" as never}>Garat</Link>
        <Link className="nav-item" href="/sections">Seksionet</Link>

        <form action={signOut} style={{ marginTop: "auto" }}>
          <button type="submit" className="nav-item" style={{ color: "var(--err, #c25a2d)", width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer" }}>
            Çkyçu →
          </button>
        </form>

        <div className="me" style={{ padding: 10, borderTop: "1px solid color-mix(in oklab, var(--ink) 8%, transparent)", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--teal)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
            {initials(profile.full_name)}
          </div>
          <div className="who" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
            {profile.full_name}
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 2 }}>
              {subline}
            </span>
          </div>
        </div>
      </aside>

      <main className="portal-main" style={{ padding: "36px 48px" }}>
        {children}
      </main>
    </div>
  );
}
