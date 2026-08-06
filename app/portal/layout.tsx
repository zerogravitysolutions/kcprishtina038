import "./portal.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { PortalLink, PortalBottomNav, type PortalItem } from "./PortalNav";

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
  const { data: athleteRows } = await supabase.from("team_members").select("id").eq("profile_id", profile.id).limit(1);
  const isAthlete = ((athleteRows as { id: string }[] | null)?.length ?? 0) > 0;

  const roleLine = profile.role === "member" ? "Anëtar" : profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  const subline = sectionName ? `${roleLine} · ${sectionName}` : roleLine;
  const ini = initials(profile.full_name);

  const bottomItems: PortalItem[] = [
    { href: "/portal", label: "Paneli", icon: "home" },
    ...(isAthlete
      ? ([{ href: "/portal/training", label: "Stërvitjet", icon: "activity" }, { href: "/portal/performance", label: "Forma", icon: "chart" }] as PortalItem[])
      : []),
    { href: "/races", label: "Garat", icon: "trophy" },
    { href: "/portal/profile", label: "Profili", icon: "user" },
  ];

  return (
    <div className="portal-shell">
      {/* Mobile top bar */}
      <header className="portal-topbar">
        <Link href="/" className="brand"><img src="/assets/logo.jpg" alt="" /><b>Prishtina 038</b></Link>
        <div className="avatar">{ini}</div>
      </header>

      {/* Desktop left rail */}
      <aside className="portal-side">
        <Link href="/" className="brand">
          <img src="/assets/logo.jpg" alt="" />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>Prishtina 038</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 3 }}>Portali</div>
          </div>
        </Link>

        <div className="portal-group">Hapësira jote</div>
        <PortalLink href="/portal" label="Paneli" icon="home" />
        <PortalLink href="/portal/profile" label="Profili & dokumentet" icon="user" />

        {isAthlete && (
          <>
            <div className="portal-group">Stërvitja</div>
            <PortalLink href="/portal/training" label="Stërvitjet" icon="activity" />
            <PortalLink href="/portal/performance" label="Performanca" icon="chart" />
          </>
        )}

        <div className="portal-group">Klubi</div>
        <PortalLink href="/races" label="Garat & rezultatet" icon="trophy" />
        <PortalLink href="/#disciplines" label="Seksionet" icon="grid" />

        <div className="portal-side-foot">
          <div className="portal-me">
            <div className="avatar">{ini}</div>
            <div className="who">{profile.full_name}<span>{subline}</span></div>
          </div>
          <form action={signOut}>
            <button type="submit" className="portal-signout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12H3M9 6l-6 6 6 6M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></svg>
              Çkyçu
            </button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <main className="portal-main">{children}</main>

      {/* Mobile bottom tab bar */}
      <PortalBottomNav items={bottomItems} />
    </div>
  );
}
